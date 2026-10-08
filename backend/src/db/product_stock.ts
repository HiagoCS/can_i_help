const { sqlite } = require("./index");
interface MovementDetails { referenceId?: number | null; movementValue?: string | number | null; notes?: string | null; dtUpdate?: string; }
function recordProductMovement(product: any, movementType: string, quntAdd: number = 0, quntRemove: number = 0, details: MovementDetails = {}) {
    if (quntAdd > 0 && quntRemove > 0) throw new Error("Uma movimentação só pode adicionar ou remover quantidade.");
    const sql = "INSERT INTO update_stock (product_id,movement_type,qunt_remove,qunt_add,dt_update,reference_id,movement_value,unit_measure,notes,sm_code,bar_code,name,description,value,cost,amount,ncm,cst,csosn,icms,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    sqlite.prepare(sql).run(product.id,movementType,quntRemove,quntAdd,details.dtUpdate ?? new Date().toISOString(),details.referenceId ?? null,details.movementValue ?? product.value ?? null,product.unit_measure ?? product.unitMeasure ?? "UN",details.notes ?? null,product.sm_code,product.bar_code,product.name,product.description ?? null,product.value ?? null,product.cost ?? null,product.amount ?? null,product.ncm ?? null,product.cst ?? "0",product.csosn ?? "0",product.icms ?? 0,product.status ? 1 : 0);
}
module.exports = { recordProductMovement };