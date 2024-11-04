const Coupon = require('../../models/coupon')

const loadCoupon = async (req, res) => {
    try {
        const coupons = await Coupon.find({});
        res.status(200).render('admin/coupon', { coupons });
    } catch (error) {
        console.log(error)
        res.status(400).render('errorPage', { message: error.message });
    }
};

const loadCoupons = async (req, res) => {
    try {
        const filter = req.query.filter || 'all';
        let query = {};

        switch (filter) {
            case 'active':
                query.isActive = true;
                break;
            case 'inactive':
                query.isActive = false;
                break;
            case 'userSpecific':
                query.userSpecific = true;
                break;
            case 'public':
                query.userSpecific = false;
                break;
        }

        const coupons = await Coupon.find(query).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            coupons
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching coupons'
        });
    }
};

// Create new coupon
const couponCreate = async (req, res) => {
    try {
        const {
            name,
            description,
            discountType,
            discountAmount,
            minimumPurchase,
            maxDiscount,
            validFrom,
            validUntil,
            usageLimit,
            userSpecific
        } = req.body;

        // Check if coupon with same name exists
        const existingCoupon = await Coupon.findOne({ name: name.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'Coupon with this name already exists'
            });
        }

        // Validate dates
        const now = new Date();
        const startDate = new Date(validFrom);
        const endDate = new Date(validUntil);

        if (startDate < now) {
            return res.status(400).json({
                success: false,
                message: 'Start date cannot be in the past'
            });
        }

        if (endDate <= startDate) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Validate discount
        if (discountType === 'percentage' && (discountAmount <= 0 || discountAmount > 100)) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount must be between 0 and 100'
            });
        }

        const newCoupon = new Coupon({
            name: name.toUpperCase(),
            description,
            discountType,
            discountAmount,
            minimumPurchase,
            maxDiscount,
            validFrom: startDate,
            validUntil: endDate,
            usageLimit,
            userSpecific,
            isActive: true,
            usedCount: 0
        });

        await newCoupon.save();
        res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            coupon: newCoupon
        });
    } catch (error) {
        console.log(error)
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating coupon'
        });
    }
};

const loadSingleCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }
        res.status(200).json({
            success: true,
            coupon
        });
    } catch (error) {
        console.log(error)
        res.status(500).json({
            success: false,
            message: 'Error fetching coupon'
        });
    }
};

const couponEdit = async (req, res) => {
    try {
        const couponId = req.params.id;
        const updateData = req.body;

        // Check if updating name and if it already exists
        if (updateData.name) {
            const existingCoupon = await Coupon.findOne({ 
                name: updateData.name.toUpperCase(),
                _id: { $ne: couponId }
            });
            if (existingCoupon) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon with this name already exists'
                });
            }
            updateData.name = updateData.name.toUpperCase();
        }

        const coupon = await Coupon.findByIdAndUpdate(
            couponId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Coupon updated successfully',
            coupon
        });
    } catch (error) {
        console.log(error)
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating coupon'
        });
    }
};

const toggleCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.body; 

        const updateField = type === 'active' ? 'isActive' : 'userSpecific';
        const coupon = await Coupon.findById(id);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        coupon[updateField] = !coupon[updateField];
        await coupon.save();

        res.status(200).json({
            success: true,
            message: `Coupon ${updateField} updated successfully`,
            coupon
        });
    } catch (error) {
        console.log(error)
        res.status(500).json({
            success: false,
            message: 'Error toggling coupon status'
        });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Coupon deleted successfully'
        });
    } catch (error) {
        console.log(error)
        res.status(500).json({
            success: false,
            message: 'Error deleting coupon'
        });
    }
};

module.exports = {
    loadCoupon,
    loadCoupons,
    couponCreate,
    loadSingleCoupon,
    couponEdit,
    toggleCoupon,
    deleteCoupon
}