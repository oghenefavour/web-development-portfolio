const express = require('express');
const Cart = require('../models/cartModel');
const { positiveInt, cartId } = require('../utils/validators');

const router = express.Router();

router.post('/carts', async (req, res) => {
  res.status(201).json({ data: await Cart.create() });
});

router.get('/carts/:cartId', async (req, res) => {
  res.json({ data: await Cart.get(cartId(req.params.cartId)) });
});

router.post('/carts/:cartId/items', async (req, res) => {
  const b = req.body || {};
  const cart = await Cart.addItem(
    cartId(req.params.cartId),
    positiveInt(b.productId, 'productId'),
    positiveInt(b.quantity ?? 1, 'quantity'),
  );
  res.status(201).json({ data: cart });
});

router.patch('/carts/:cartId/items/:productId', async (req, res) => {
  const cart = await Cart.setItemQuantity(
    cartId(req.params.cartId),
    positiveInt(req.params.productId, 'productId'),
    positiveInt((req.body || {}).quantity, 'quantity', { min: 0 }),
  );
  res.json({ data: cart });
});

router.delete('/carts/:cartId/items/:productId', async (req, res) => {
  const cart = await Cart.removeItem(cartId(req.params.cartId), positiveInt(req.params.productId, 'productId'));
  res.json({ data: cart });
});

module.exports = router;
