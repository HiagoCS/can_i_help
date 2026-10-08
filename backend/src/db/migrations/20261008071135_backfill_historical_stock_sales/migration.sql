INSERT INTO update_stock (
    product_id, movement_type, qunt_remove, qunt_add, dt_update, reference_id,
    movement_value, unit_measure, notes, sm_code, bar_code, name, description,
    value, cost, amount, ncm, cst, csosn, icms, status
)
SELECT
    sale_item.product_id,
    'sale',
    sale_item.qunt_sale,
    0,
    sale.dt_sale,
    sale_item.sale_id,
    sale_item.value,
    COALESCE(NULLIF(sale_item.unit_measure, ''), product.unit_measure, 'UN'),
    'Venda hist�rica importada; custo e estoque hist�ricos indispon�veis.',
    product.sm_code,
    product.bar_code,
    product.name,
    product.description,
    sale_item.value,
    NULL,
    NULL,
    product.ncm,
    product.cst,
    product.csosn,
    product.icms,
    product.status
FROM stock_sale AS sale_item
JOIN cashier AS sale ON sale.id = sale_item.sale_id
JOIN products AS product ON product.id = sale_item.product_id
WHERE NOT EXISTS (
    SELECT 1
    FROM update_stock AS movement
    WHERE movement.movement_type = 'sale'
      AND movement.reference_id = sale_item.sale_id
      AND movement.product_id = sale_item.product_id
);
