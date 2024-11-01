const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    brandName: {
        type: String,
        required: true, 
        trim: true,
    },     
    category: {
        type: mongoose.Schema.Types.ObjectId,
        required: true, 
        trim: true,
        ref: 'Category'    
    },
    image: {
        type: [String],
        required: true, 
        trim: true,     
    },
    description: {
        type: String,
        trim: true,     
    },
    isDeleted: {
        type: Boolean, 
        default: false
    },
    variants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'productVariant'
    }]
},{
    timestamps:true
});

module.exports = mongoose.model('Product', productSchema);
