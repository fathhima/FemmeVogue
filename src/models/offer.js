const mongoose = require('mongoose')

const offerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['product','category','referral'],
        required: true
    },
    discountType: {
        type: String,
        enum: ['percentage','fixed'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    minPurchaseAmount: {
        type: Number,
        default:0
    },
    maxDiscountAmount: {
        type: Number
    },
    applicableFor: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'type'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    referralBenefit: {
        referrer: {
            type: Number,
            default: 0
        },
        referee: {
            type: Number,
            default: 0
        },
    },
},{
    timestamps: true
})

module.exports = mongoose.model('Offer',offerSchema)