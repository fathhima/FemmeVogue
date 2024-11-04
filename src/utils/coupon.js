const Coupon = require('../models/coupon')

const validateCoupon = async (couponCode, userId, subtotal) => {
    const coupon = await Coupon.findOne({
      name: couponCode.toUpperCase(),
      isActive: true
    });
  
    if (!coupon) {
      throw new Error('Invalid coupon code');
    }
  
    // Check date validity
    const currentDate = new Date();
    if (coupon.validFrom > currentDate) {
      throw new Error('Coupon is not yet active');
    }
    if (coupon.validUntil < currentDate) {
      throw new Error('Coupon has expired');
    }
  
    // Check minimum purchase
    if (subtotal < coupon.minimumPurchase) {
      throw new Error(`Minimum purchase amount of ₹${coupon.minimumPurchase} required`);
    }
  
    // Check user's usage of this coupon
    const userUsage = coupon.usedBy.find(usage => 
      usage.userId.toString() === userId.toString()
    );
  
    if (userUsage) {
      if (userUsage.useCount >= coupon.userLimit) {
        throw new Error(`You've reached the maximum usage limit (${coupon.userLimit}) for this coupon`);
      }
    }
  
    return coupon;
  };

  module.exports = {validateCoupon}