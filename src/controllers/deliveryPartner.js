const DeliveryPartner = require("../models/DeliveryPartner");

exports.getAllDeliveryPartners = async (req, res) => {
    try {
        const partners = await DeliveryPartner.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: partners
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: error.message
        });
    }
};

exports.createDeliveryPartner = async (req, res) => {
    try {
        const { name, trackingUrlTemplate } = req.body;

        const partner = await DeliveryPartner.create({
            name,
            trackingUrlTemplate
        });

        res.status(201).json({
            success: true,
            message: "Delivery Partner created successfully",
            data: partner
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Partner with this name already exists"
            });
        }
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateDeliveryPartner = async (req, res) => {
    try {
        const { name, trackingUrlTemplate, isActive } = req.body;

        const partner = await DeliveryPartner.findByIdAndUpdate(
            req.params.id,
            { name, trackingUrlTemplate, isActive },
            { new: true, runValidators: true }
        );

        if (!partner) {
            return res.status(404).json({
                success: false,
                message: "Delivery Partner not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Delivery Partner updated successfully",
            data: partner
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Partner with this name already exists"
            });
        }
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteDeliveryPartner = async (req, res) => {
    try {
        const partner = await DeliveryPartner.findByIdAndDelete(req.params.id);

        if (!partner) {
            return res.status(404).json({
                success: false,
                message: "Delivery Partner not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Delivery Partner deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: error.message
        });
    }
};
