const mongoose = require("mongoose");

const deliveryPartnerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Partner name is required"],
        unique: true,
        trim: true
    },
    trackingUrlTemplate: {
        type: String,
        trim: true,
        validate: {
            validator: function (v) {
                // If requiresTrackingUrl is true, template must be present and contain {trackingId}
                if (this.requiresTrackingUrl) {
                    return v && v.includes("{trackingId}");
                }
                return true;
            },
            message: "URL template must contain {trackingId} placeholder when tracking URL is required"
        }
    },
    requiresTrackingUrl: {
        type: Boolean,
        default: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model("DeliveryPartner", deliveryPartnerSchema);
