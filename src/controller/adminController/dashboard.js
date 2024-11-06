const Order = require('../../models/order');
const moment = require('moment');

// Helper function to calculate report summary
const calculateSummary = (orders) => {
    console.log(`Calculating summary for ${orders.length} orders`);
    return orders.reduce((summary, order) => {
        summary.totalSales += order.subtotal || 0;
        summary.totalOrders += 1;
        summary.totalDiscount += order.couponDiscount || 0;
        summary.netRevenue += order.finalTotal || 0;
        return summary;
    }, {
        totalSales: 0,
        totalOrders: 0,
        totalDiscount: 0,
        netRevenue: 0
    });
};

// Helper function to group orders by date
const groupOrdersByDate = (orders, reportType) => {
    console.log(`Grouping ${orders.length} orders by ${reportType}`);
    const groupedOrders = {};
    
    orders.forEach(order => {
        if (!order.orderedAt) {
            console.log('Order missing orderedAt:', order._id);
            return;
        }

        let dateKey;
        const orderDate = moment(order.orderedAt);
        
        switch (reportType) {
            case 'daily':
                dateKey = orderDate.format('YYYY-MM-DD');
                break;
            case 'weekly':
                dateKey = `Week ${orderDate.isoWeek()} - ${orderDate.year()}`;
                break;
            case 'monthly':
                dateKey = orderDate.format('MMMM YYYY');
                break;
            case 'yearly':
                dateKey = orderDate.format('YYYY');
                break;
            default:
                dateKey = orderDate.format('YYYY-MM-DD');
        }

        if (!groupedOrders[dateKey]) {
            groupedOrders[dateKey] = {
                date: dateKey,
                orders: 0,
                grossSales: 0,
                discounts: 0,
                couponDeductions: 0,
                netSales: 0
            };
        }

        groupedOrders[dateKey].orders += 1;
        groupedOrders[dateKey].grossSales += order.subtotal || 0;
        
        // Calculate item discounts safely
        const itemDiscounts = order.items?.reduce((total, item) => {
            if (!item || !item.price || !item.quantity) return total;
            const originalPrice = item.price * item.quantity;
            return total + (originalPrice - (item.price * item.quantity));
        }, 0) || 0;

        groupedOrders[dateKey].discounts += itemDiscounts;
        groupedOrders[dateKey].couponDeductions += order.couponDiscount || 0;
        groupedOrders[dateKey].netSales += order.finalTotal || 0;
    });

    return Object.values(groupedOrders);
};

const generateReport = async (req, res) => {
    console.log('Generating report - Request received:', req.body);
    
    try {
        const { reportType, startDate, endDate } = req.body;
        
        if (!reportType || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters'
            });
        }

        const parsedStartDate = moment(startDate).startOf('day');
        const parsedEndDate = moment(endDate).endOf('day');

        if (!parsedStartDate.isValid() || !parsedEndDate.isValid()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format'
            });
        }

        console.log('Querying orders between:', parsedStartDate.toISOString(), 'and', parsedEndDate.toISOString());
        
        const baseQuery = {
            orderStatus: 'delivered',
            paymentStatus: 'completed',
            orderedAt: {
                $gte: parsedStartDate.toDate(),
                $lte: parsedEndDate.toDate()
            }
        };

        const orders = await Order.find(baseQuery)
            .populate('items.productId', 'name originalPrice')
            .populate('appliedCoupon', 'code discountAmount')
            .sort({ orderedAt: 1 })
            .lean();

        console.log(`Found ${orders.length} orders matching criteria`);

        if (orders.length === 0) {
            return res.json({
                success: true,
                summary: {
                    totalSales: 0,
                    totalOrders: 0,
                    totalDiscount: 0,
                    netRevenue: 0
                },
                details: []
            });
        }

        // Calculate summary
        const summary = calculateSummary(orders);
        console.log('Summary calculated:', summary);

        // Group orders by date
        const details = groupOrdersByDate(orders, reportType);
        console.log(`Grouped into ${details.length} ${reportType} periods`);

        res.json({
            success: true,
            summary,
            details
        });

    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating report',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    generateReport
};