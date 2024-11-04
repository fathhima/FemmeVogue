const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        variantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'productVariant',
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        cancelled: {
            type: Boolean,
            default: false
        },
        status: {
            type: String,
            enum: ['pending','processing','shipped','delivered','cancelled'],
            default: 'pending'
        },
        cancelReason: {
            type: String
        }
    }],
    shippingAddress: {
        name: {
            type: String,
            required: true
        },
        addressLine: {
            type: String,
            required: true
        },
        phone: {
            type: String,
            required: true
        },
        addressType: {
            type: String,
            required: true
        }
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'razorpay', 'wallet'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'not-paid','completed','cancelled'],
        default: 'not-paid'
    },
    orderStatus: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    subtotal: {
        type: Number,
        required: true
    },
    shippingCharge: {
        type: Number,
        required: true
    },
    finalTotal: {
        type: Number,
        required: true
    },
    orderedAt: {
        type: Date,
        default: Date.now
    },
    appliedCoupon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon'
    },
    couponDiscount: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('Order', orderSchema);