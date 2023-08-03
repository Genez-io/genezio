const orders: Order[] = [
  {
    id: 1,
    detail: "Order 1"
  },
  {
    id: 2,
    detail: "Order 2"
  },
  {
    id: 3,
    detail: "Order 3"
  },
  {
    id: 4,
    detail: "Order 4",
    referenceId: 1
  }
];

const newOrders = orders.filter(
  order => order.referenceId && !orders.find(o => o.referenceId === order.id)
);

const mapIds = {};
const newOrders = orders.filter(order => {
  mapIds[order.id] = true;
  if (order.referenceId) {
    return !mapIds[order.referenceId];
  }
});
