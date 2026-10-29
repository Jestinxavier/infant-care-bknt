process.env.MEDIA_SERVER_URL = process.env.MEDIA_SERVER_URL || "http://localhost:5003";
process.env.MEDIA_SERVER_API_KEY =
  process.env.MEDIA_SERVER_API_KEY || "test-media-key";

const mongoose = require("mongoose");
const cron = require("node-cron");
const Media = require("../../src/models/Media");
const CsvTempImage = require("../../src/models/CsvTempImage");
const Asset = require("../../src/models/Asset");
const AiDailyReport = require("../../src/models/AiDailyReport");
const {
  cleanupStaleTempImages,
  startMediaCleanupCron,
} = require("../../src/services/mediaCleanupService");
const {
  cleanupStaleCsvTempImages,
  startCsvImageCleanupCron,
} = require("../../src/services/csvImageCleanupService");
const startAssetCleanupCron = require("../../src/jobs/cleanupExpiredAssets");
const {
  executeCleanup,
  startCleanupCron,
  runCleanupOnStartup,
} = require("../../src/jobs/cleanupExpiredAssets");
const {
  getKolkataDayRange,
  getYesterdayDateStr,
  generateReportForDate,
  runDailyAiReport,
  startDailyAiReportCron,
} = require("../../src/services/aiReportService");

jest.mock("node-cron", () => ({ schedule: jest.fn() }));

jest.mock("../../src/config/mediaServer", () => {
  const actual = jest.requireActual("../../src/config/mediaServer");
  return { ...actual, deleteFromMediaServer: jest.fn() };
});

const { deleteFromMediaServer } = require("../../src/config/mediaServer");

const DAY_MS = 24 * 60 * 60 * 1000;
let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${counter++}`;
const staleDate = () => new Date(Date.now() - 8 * DAY_MS);
const mediaUrl = (name) =>
  `${process.env.MEDIA_SERVER_URL || "http://localhost:5003"}/uploads/${name}`;

const makeMedia = (overrides = {}) =>
  Media.create({
    public_id: unique("media"),
    url: mediaUrl(unique("stale") + ".jpg"),
    isTemp: true,
    uploadedAt: staleDate(),
    ...overrides,
  });

const makeCsvImage = (overrides = {}) =>
  CsvTempImage.create({
    temp_key: unique("csv-temp"),
    public_id: unique("csv-public"),
    url: mediaUrl(unique("csv") + ".jpg"),
    uploadedAt: staleDate(),
    ...overrides,
  });

const makeAsset = (overrides = {}) =>
  Asset.create({
    publicId: unique("asset"),
    secureUrl: mediaUrl(unique("asset") + ".jpg"),
    assetId: unique("asset-id"),
    hash: unique("hash"),
    status: "temp",
    expiresAt: staleDate(),
    origin: { source: "product", sourceContext: "background-jobs-test" },
    uploadedBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });

describe("Background jobs", () => {
  beforeEach(() => {
    cron.schedule.mockReset();
    deleteFromMediaServer.mockReset();
    deleteFromMediaServer.mockResolvedValue({ success: true });
  });

  it("cleans only stale temporary media, tolerates failures, and schedules the cron", async () => {
    const stale = await makeMedia();
    const fresh = await makeMedia({ uploadedAt: new Date() });
    const permanent = await makeMedia({
      isTemp: false,
      uploadedAt: staleDate(),
    });
    const failingPublicId = unique("failing");
    const failing = await makeMedia({
      public_id: failingPublicId,
      url: mediaUrl(`${failingPublicId}.jpg`),
    });
    deleteFromMediaServer.mockImplementation(async (filename) => {
      if (filename.includes(failingPublicId)) throw new Error("registry down");
      return { success: true };
    });

    await cleanupStaleTempImages();

    expect(await Media.findById(stale._id)).toBeNull();
    expect(await Media.findById(failing._id)).not.toBeNull();
    expect(await Media.findById(fresh._id)).not.toBeNull();
    expect(await Media.findById(permanent._id)).not.toBeNull();
    expect(deleteFromMediaServer).toHaveBeenCalledTimes(2);

    deleteFromMediaServer.mockResolvedValue({ success: true });
    startMediaCleanupCron();
    expect(cron.schedule).toHaveBeenCalledWith(
      "0 2 * * *",
      expect.any(Function),
    );
    const callback = cron.schedule.mock.calls[0][1];
    await callback();
    expect(await Media.findById(failing._id)).toBeNull();
  });

  it("cleans stale CSV temp images and reports counts", async () => {
    const stale = await makeCsvImage();
    const fresh = await makeCsvImage({ uploadedAt: new Date() });

    const first = await cleanupStaleCsvTempImages();
    expect(first).toEqual({ deleted: 1, failed: 0 });
    expect(await CsvTempImage.findById(stale._id)).toBeNull();
    expect(await CsvTempImage.findById(fresh._id)).not.toBeNull();

    const empty = await cleanupStaleCsvTempImages();
    expect(empty).toEqual({ deleted: 0, failed: 0 });

    startCsvImageCleanupCron();
    expect(cron.schedule).toHaveBeenCalledWith(
      "15 2 * * *",
      expect.any(Function),
    );
  });

  it("cleans expired temp and archived assets in dry-run and live modes", async () => {
    const expiredTemp = await makeAsset();
    const usedTemp = await makeAsset({
      usedBy: [{ entity: "product", id: new mongoose.Types.ObjectId() }],
    });
    const activeTemp = await makeAsset({
      expiresAt: new Date(Date.now() + DAY_MS),
    });
    const oldArchived = await makeAsset({
      status: "archived",
      archivedAt: staleDate(),
      expiresAt: null,
    });

    const dryRun = await executeCleanup({ dryRun: true });
    expect(dryRun.tempAssetsFound).toBe(1);
    expect(dryRun.archivedAssetsFound).toBe(1);
    expect(dryRun.deletedCount).toBe(0);
    expect(await Asset.findById(expiredTemp._id)).not.toBeNull();

    const live = await executeCleanup();
    expect(live.deletedCount).toBe(2);
    expect(live.failedCount).toBe(0);
    expect(await Asset.findById(expiredTemp._id)).toBeNull();
    expect(await Asset.findById(oldArchived._id)).toBeNull();
    expect(await Asset.findById(usedTemp._id)).not.toBeNull();
    expect(await Asset.findById(activeTemp._id)).not.toBeNull();

    const empty = await executeCleanup();
    expect(empty.deletedCount).toBe(0);
    expect(empty.tempAssetsFound).toBe(0);
  });

  it("records asset deletion failures and supports cron/startup triggers", async () => {
    const failing = await makeAsset();
    deleteFromMediaServer.mockRejectedValueOnce(new Error("media offline"));

    const result = await executeCleanup();
    expect(result.deletedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toEqual(
      expect.objectContaining({ publicId: failing.publicId, error: "media offline" }),
    );
    expect(await Asset.findById(failing._id)).not.toBeNull();

    startCleanupCron();
    expect(cron.schedule).toHaveBeenCalledWith("0 2 * * *", expect.any(Function));
    const cronCallback = cron.schedule.mock.calls[0][1];
    await cronCallback();
    expect(await Asset.findById(failing._id)).toBeNull();

    const startup = await makeAsset();
    let startupTimer;
    const timeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation((fn, ms) => {
        startupTimer = { fn, ms };
        return 1;
      });
    runCleanupOnStartup();
    expect(startupTimer.ms).toBe(30000);
    await startupTimer.fn();
    timeoutSpy.mockRestore();
    expect(await Asset.findById(startup._id)).toBeNull();
    expect(startAssetCleanupCron).toBe(startCleanupCron);

    deleteFromMediaServer.mockResolvedValue({ success: true });
  });

  it("generates a deterministic fallback AI report and updates it idempotently", async () => {
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const first = await generateReportForDate("2026-10-25");
      expect(first).toEqual({
        saved: true,
        date: "2026-10-25",
        status: "fallback",
        provider: "template",
      });
      expect(await AiDailyReport.countDocuments({ date: "2026-10-25" })).toBe(1);

      const second = await generateReportForDate("2026-10-25");
      expect(second.saved).toBe(true);
      expect(await AiDailyReport.countDocuments({ date: "2026-10-25" })).toBe(1);
      const report = await AiDailyReport.findOne({ date: "2026-10-25" }).lean();
      expect(report.content).toBeTruthy();
      expect(report.aiError).toContain("deterministic template");
    } finally {
      if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = savedKey;
    }
  });

  it("computes Kolkata day boundaries and runs the daily report hook", async () => {
    const { from, to } = getKolkataDayRange("2026-10-26");
    expect(from.toISOString()).toBe("2026-10-25T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-10-26T18:29:59.999Z");
    expect(to.getTime() - from.getTime()).toBe(DAY_MS - 1);
    expect(getYesterdayDateStr(new Date("2026-10-27T00:00:00Z"))).toBe(
      "2026-10-26",
    );

    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const onComplete = jest.fn();
      const result = await runDailyAiReport({ onComplete });
      expect(result).toEqual(
        expect.objectContaining({ saved: true, status: "fallback", provider: "template" }),
      );
      expect(onComplete).toHaveBeenCalledWith(result);
      expect(await AiDailyReport.findOne({ date: result.date })).not.toBeNull();
    } finally {
      if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = savedKey;
    }

    startDailyAiReportCron();
    expect(cron.schedule).toHaveBeenCalledWith("10 23 * * *", expect.any(Function));
  });
});
