const Coupon = require("../../models/coupon");

const availableCoupons = async (req, res) => {
  try {
    const currentDate = new Date();
    const coupons = await Coupon.aggregate([
      {
        $match: {
          isActive: true,
          userSpecific: false,
          validUntil: { $gt: currentDate },
          validFrom: { $lt: currentDate },
          $expr: { $gt: ["$usageLimit", "$usedCount"] },
        },
      },
    ]);

    res.json(coupons);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching coupons" });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { couponCode, cartTotal } = req.body;
    const coupon = await Coupon.findOne({
      name: couponCode.toUpperCase(),
      isActive: true,
    });
    if (!coupon) {
      return res.status(400).json({ message: "Invalid coupon code" });
    }
    // Validate date range
    const currentDate = new Date();
    if (coupon.validFrom > currentDate) {
      return res.status(400).json({ message: "Coupon is not yet active" });
    }
    if (coupon.validUntil < currentDate) {
      return res.status(400).json({ message: "Coupon has expired" });
    }
    // Validate minimum purchase
    if (cartTotal < coupon.minimumPurchase) {
      return res.status(400).json({
        message: `Minimum purchase amount of ₹${coupon.minimumPurchase} required`,
      });
    }
    // Check user's usage of this coupon
    const userUsage = coupon.usedBy.find(
      (usage) => usage.userId.toString() === userId.toString()
    );

    if (userUsage) {
      if (userUsage.useCount >= coupon.userLimit) {
        return res.status(400).json({
          message: `You've reached the maximum usage limit (${coupon.userLimit}) for this coupon`,
        });
      }
    }
    // Calculate discount
    let discountAmount =
      coupon.discountType === "percentage"
        ? (cartTotal * coupon.discountAmount) / 100
        : coupon.discountAmount;

    // Apply max discount if specified
    if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
      discountAmount = coupon.maxDiscount;
    }

    res.json({
      success: true,
      couponDetails: {
        code: coupon.name,
        discountAmount,
        discountType: coupon.discountType,
        userSpecific: coupon.userSpecific,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error validating coupon" });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;

    if (!couponCode) {
      return res.status(400).json({ message: "Coupon code is required" });
    }

    // Find the coupon by code
    const coupon = await Coupon.findOne({
      name: couponCode.toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return res
        .status(400)
        .json({ message: "Coupon not found or already inactive" });
    }

    // Optional: Decrease the used count if you want to free up one usage for this coupon
    if (coupon.usedCount > 0) {
      coupon.usedCount -= 1;
      await coupon.save();
    }

    res.json({ success: true, message: "Coupon removed successfully" });
  } catch (err) {
    console.error("Error removing coupon:", err);
    res.status(500).json({ message: "Error removing coupon" });
  }
};

module.exports = {
  availableCoupons,
  applyCoupon,
  removeCoupon,
};
