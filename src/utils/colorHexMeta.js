const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const toPlainObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value.toObject === "function") {
    return value.toObject({
      flattenMaps: true,
      virtuals: false,
      getters: false,
      depopulate: true,
    });
  }
  if (typeof value === "object") return value;
  return {};
};

const normalizeHexColor = (value) => {
  const raw = String(value ?? "").trim();
  if (!HEX_COLOR_REGEX.test(raw)) return null;
  return raw.toLowerCase();
};

const isColorOption = (option) => {
  const code = String(option?.code ?? "").trim().toLowerCase();
  const name = String(option?.name ?? "").trim().toLowerCase();
  return code === "color" || name === "color";
};

const extractColorHexFromUiMeta = (uiMeta, normalizeColorToken) => {
  const source = toPlainObject(uiMeta);
  const colorMeta = toPlainObject(source.color);
  const result = {};

  Object.entries(colorMeta).forEach(([rawColor, value]) => {
    const color = normalizeColorToken(rawColor);
    const hex = normalizeHexColor(value?.hex);
    if (!color || !hex) return;
    result[color] = { hex };
  });

  return result;
};

const extractColorHexFromVariantOptions = (variantOptions, normalizeColorToken) => {
  const options = Array.isArray(variantOptions) ? variantOptions : [];
  const result = {};

  options.forEach((option) => {
    if (!isColorOption(option)) return;
    const values = Array.isArray(option?.values) ? option.values : [];

    values.forEach((entry) => {
      const color = normalizeColorToken(entry?.value || entry?.label || "");
      const hex = normalizeHexColor(entry?.hex);
      if (!color || !hex) return;
      result[color] = { hex };
    });
  });

  return result;
};

const parseKeyValueToken = (token) => {
  const raw = String(token ?? "").trim();
  if (!raw) return { key: "", value: "" };

  const colonIndex = raw.indexOf(":");
  const equalsIndex = raw.indexOf("=");
  const separatorIndex =
    colonIndex === -1
      ? equalsIndex
      : equalsIndex === -1
      ? colonIndex
      : Math.min(colonIndex, equalsIndex);

  if (separatorIndex === -1) {
    return { key: raw, value: "" };
  }

  return {
    key: raw.slice(0, separatorIndex).trim(),
    value: raw.slice(separatorIndex + 1).trim(),
  };
};

const parseColorHexInput = (input, normalizeColorToken) => {
  if (input == null) return {};

  let source = input;
  if (typeof source === "string") {
    const raw = source.trim();
    if (!raw) return {};

    if (raw.startsWith("{")) {
      try {
        source = JSON.parse(raw);
      } catch (error) {
        source = raw;
      }
    } else {
      source = raw;
    }
  }

  const result = {};

  if (typeof source === "string") {
    source
      .split(",")
      .map((token) => parseKeyValueToken(token))
      .forEach(({ key, value }) => {
        const color = normalizeColorToken(key);
        const hex = normalizeHexColor(value);
        if (!color || !hex) return;
        result[color] = { hex };
      });
    return result;
  }

  if (Array.isArray(source)) {
    source.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const color = normalizeColorToken(entry.color || entry.name || entry.key);
      const hex = normalizeHexColor(entry.hex || entry.value);
      if (!color || !hex) return;
      result[color] = { hex };
    });
    return result;
  }

  if (typeof source === "object") {
    Object.entries(toPlainObject(source)).forEach(([rawColor, rawMeta]) => {
      const color = normalizeColorToken(rawColor);
      const hex =
        rawMeta && typeof rawMeta === "object"
          ? normalizeHexColor(rawMeta.hex)
          : normalizeHexColor(rawMeta);
      if (!color || !hex) return;
      result[color] = { hex };
    });
  }

  return result;
};

const mergeColorHexUiMeta = ({
  existingUiMeta,
  variantOptions,
  colorHexInput,
  normalizeColorToken,
  colorAllowList,
}) => {
  const baseUiMeta = toPlainObject(existingUiMeta);
  const baseColorMap = extractColorHexFromUiMeta(baseUiMeta, normalizeColorToken);
  const variantColorMap = extractColorHexFromVariantOptions(
    variantOptions,
    normalizeColorToken
  );
  const inputColorMap = parseColorHexInput(colorHexInput, normalizeColorToken);

  let mergedColorMap = {
    ...baseColorMap,
    ...variantColorMap,
    ...inputColorMap,
  };

  if (Array.isArray(colorAllowList) && colorAllowList.length > 0) {
    const allowed = new Set(
      colorAllowList.map((value) => normalizeColorToken(value)).filter(Boolean)
    );
    mergedColorMap = Object.fromEntries(
      Object.entries(mergedColorMap).filter(([key]) => allowed.has(key))
    );
  }

  const mergedUiMeta = { ...baseUiMeta };
  if (Object.keys(mergedColorMap).length > 0) {
    mergedUiMeta.color = mergedColorMap;
  } else {
    delete mergedUiMeta.color;
  }

  return mergedUiMeta;
};

module.exports = {
  HEX_COLOR_REGEX,
  normalizeHexColor,
  parseColorHexInput,
  extractColorHexFromVariantOptions,
  extractColorHexFromUiMeta,
  mergeColorHexUiMeta,
};
