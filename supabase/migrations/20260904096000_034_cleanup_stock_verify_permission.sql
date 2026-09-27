/*
  Complément à la migration 033 (simplification du stock, demande explicite
  de Demba) : verify_supplier_stock a été supprimée, donc la permission
  stock.verify ne protège plus aucune action. On la retire du catalogue
  pour ne pas laisser une permission fantôme dans Dashboard → Employés →
  Permissions (§20, même logique que les champs de formulaire).

  stock.view / stock.edit restent : elles protègent encore stock_movements
  (table de journal préexistante) et product_suppliers (comparaison de prix,
  volontairement conservée).
*/

delete from public.role_permissions where permission_code = 'stock.verify';
delete from public.permissions where code = 'stock.verify';
