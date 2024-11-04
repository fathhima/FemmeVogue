const mongoose = require('mongoose')

const couponSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    description: {
        type: String,
        required: true
    },
    discountType: {
        type: String,
        enum: ['percentage','fixed'],
        required: true
    },
    discountAmount: {
        type: Number,
        required: true
    },
    minimumPurchase: {
        type: Number,
        default: 0
    },
    maxDiscount: {
        type: Number
    },
    validFrom: {
        type: Date
    },
    validUntil: {
        type: Date
    },
    userLimit: {
        type: Number,
        default: 1,
        required: true
    },
    usedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        usedAt: {
            type: Date,
            default: Date.now
        },
        useCount: {
            type: Number,
            default: 1
        }
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    userSpecific: {
        type: Boolean,
        default: false
    },
})

module.exports = mongoose.model('Coupon',couponSchema)