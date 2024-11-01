const Offer = require('../models/offer')

const calculateDiscount = (price, offer) => {
    if (!offer || !price || price < offer.minPurchaseAmount) {
        return 0;
    }

    let discountAmount = 0;
    
    if (offer.discountType === 'percentage') {
        discountAmount = (price * offer.discountValue) / 100;
        if (offer.maxDiscountAmount) {
            discountAmount = Math.min(discountAmount, offer.maxDiscountAmount);
        }
    } else {
        discountAmount = offer.discountValue;
    }

    return Math.min(discountAmount, price);
};

const getApplicableOffers = async (product, category) => {
    try {
        const currentDate = new Date();
        
        return await Offer.find({
            isActive: true,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate },
            $or: [
                { type: 'product', applicableFor: product._id },
                { type: 'category', applicableFor: category._id }
            ]
        }).sort({ discountValue: -1 });
    } catch (error) {
        console.error('Error getting applicable offers:', error);
        return [];
    }
};

const calculateFinalPrice = async (product, variant) => {
    try {
        const offers = await getApplicableOffers(product, product.category);
        let bestDiscount = 0;

        offers.forEach(offer => {
            const discount = calculateDiscount(variant.price, offer);
            if (discount > bestDiscount) {
                bestDiscount = discount;
            }
        });

        return {
            originalPrice: variant.price,
            finalPrice: variant.price - bestDiscount,
            discountAmount: bestDiscount,
            hasOffer: bestDiscount > 0
        };
    } catch (error) {
        console.error('Error calculating final price:', error);
        return {
            originalPrice: variant.price,
            finalPrice: variant.price,
            discountAmount: 0,
            hasOffer: false
        };
    }
};

module.exports = {
    calculateDiscount,
    getApplicableOffers,
    calculateFinalPrice
}