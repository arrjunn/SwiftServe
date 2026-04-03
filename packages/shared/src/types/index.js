/**
 * JSDoc type definitions for SwiftServe.
 * Using JSDoc instead of TypeScript — keeps the project simpler.
 */

/**
 * @typedef {Object} Outlet
 * @property {string} id - UUID
 * @property {string} name
 * @property {string} brand_name
 * @property {string} address_line1
 * @property {string} city
 * @property {string} state
 * @property {string} pincode
 * @property {string} gstin
 * @property {string} phone
 * @property {string} invoice_prefix
 * @property {number} next_invoice_seq
 */

/**
 * @typedef {Object} Staff
 * @property {string} id - UUID
 * @property {string} outlet_id
 * @property {string} name
 * @property {'counter'|'kitchen'|'captain'|'owner'|'admin'} role
 * @property {string} pin_hash
 * @property {boolean} is_active
 */

/**
 * @typedef {Object} MenuItem
 * @property {string} id - UUID
 * @property {string} outlet_id
 * @property {string} category_id
 * @property {string} name
 * @property {string} short_name
 * @property {number} price - paise
 * @property {number} tax_rate - basis points
 * @property {string} hsn_code
 * @property {'veg'|'non_veg'|'egg'} food_type
 * @property {boolean} is_available
 * @property {number} prep_time_mins
 * @property {string} station
 */

/**
 * @typedef {Object} Order
 * @property {string} id - UUID
 * @property {string} outlet_id
 * @property {number} order_number
 * @property {'counter'|'zomato'|'swiggy'|'whatsapp'|'captain'} source
 * @property {'dine_in'|'takeaway'|'delivery'} type
 * @property {'received'|'preparing'|'ready'|'served'|'completed'|'cancelled'} status
 * @property {string} staff_id
 * @property {string} shift_id
 * @property {number} subtotal - paise
 * @property {number} tax_total - paise
 * @property {number} discount_amount - paise
 * @property {number} grand_total - paise
 * @property {OrderItem[]} items
 */

/**
 * @typedef {Object} OrderItem
 * @property {string} id - UUID
 * @property {string} order_id
 * @property {string} menu_item_id
 * @property {string} name - snapshot
 * @property {number} quantity
 * @property {number} unit_price - paise
 * @property {number} line_total - paise
 * @property {number} tax_rate - basis points
 * @property {number} cgst_amount - paise
 * @property {number} sgst_amount - paise
 * @property {string} station
 * @property {'pending'|'preparing'|'ready'} kds_status
 */

/**
 * @typedef {Object} Payment
 * @property {string} id - UUID
 * @property {string} order_id
 * @property {'cash'|'upi'|'card'|'split'} method
 * @property {number} amount - paise
 * @property {'pending'|'success'|'failed'|'refunded'} status
 * @property {string} gateway_txn_id
 */

export default {};
