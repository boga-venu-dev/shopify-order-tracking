const express = require('express');
const Shopify = require('shopify-api-node');

const app = express();
app.use(express.json());

const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_API_PASSWORD
});

app.post('/track_order', async (req, res) => {
  const { order_number, phone_number } = req.body;

  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const orders = await shopify.order.list({ 
      status: 'any', 
      created_at_min: sixtyDaysAgo,
      fields: 'id,order_number,name,fulfillment_status,fulfillments,estimated_delivery_at,shipping_address,billing_address'
    });
    
    const order = orders.find(o => {
      const orderMatch = o.name === `#${order_number}` || o.order_number.toString() === order_number;
      const phoneMatch = (o.shipping_address && o.shipping_address.phone === phone_number) ||
                         (o.billing_address && o.billing_address.phone === phone_number);
      return orderMatch && phoneMatch;
    });

    if (!order) {
      return res.json({ error: 'Order not found or phone number does not match. Please check your information.' });
    }

    let trackingInfo = {};
    if (order.fulfillments && order.fulfillments.length > 0) {
      const fulfillment = order.fulfillments[0];
      trackingInfo = {
        tracking_number: fulfillment.tracking_number,
        tracking_company: fulfillment.tracking_company,
        tracking_url: fulfillment.tracking_url,
      };
    }

    const dtdcFulfillment = order.fulfillments.find(f => f.tracking_company === 'DTDC');
    if (dtdcFulfillment) {
      trackingInfo = {
        tracking_number: dtdcFulfillment.tracking_number,
        tracking_company: 'DTDC',
        tracking_url: dtdcFulfillment.tracking_url || `https://tracking.dtdc.com/ctbs-tracking/customerInterface.tr?submitName=showCITrackingDetails&cType=Consignment&cnNo=${dtdcFulfillment.tracking_number}`,
      };
    }

    res.json({
      order_number: order.order_number,
      fulfillment_status: order.fulfillment_status || 'Processing',
      ...trackingInfo,
      estimated_delivery: order.estimated_delivery_at || 'Not available'
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'An error occurred while fetching the order information' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
