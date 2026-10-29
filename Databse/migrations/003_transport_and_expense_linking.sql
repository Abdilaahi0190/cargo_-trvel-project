-- Support: (1) shipments selecting a Transport Provider directly, (2) providers
-- classified as Company vs Individual, (3) payments to transport providers recorded
-- as Expenses linked to a shipment/trip/provider. All new columns are nullable so
-- existing rows and code paths are unaffected.
BEGIN;

CREATE TYPE public.provider_entity_type_enum AS ENUM ('company', 'individual');

ALTER TABLE public.transport_providers
  ADD COLUMN entity_type public.provider_entity_type_enum NOT NULL DEFAULT 'company';

ALTER TABLE public.cargo
  ADD COLUMN transport_provider_id INTEGER NULL REFERENCES public.transport_providers(provider_id);

CREATE INDEX idx_cargo_transport_provider ON public.cargo(transport_provider_id);

ALTER TABLE public.expense_charges
  ADD COLUMN trip_id INTEGER NULL REFERENCES public.trips(trip_id),
  ADD COLUMN transport_provider_id INTEGER NULL REFERENCES public.transport_providers(provider_id),
  ADD COLUMN cargo_id INTEGER NULL REFERENCES public.cargo(cargo_id);

CREATE INDEX idx_expense_charges_trip ON public.expense_charges(trip_id);
CREATE INDEX idx_expense_charges_provider ON public.expense_charges(transport_provider_id);
CREATE INDEX idx_expense_charges_cargo ON public.expense_charges(cargo_id);

INSERT INTO public.expense_types (name)
SELECT 'Transport Provider Payment'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_types WHERE name = 'Transport Provider Payment');

COMMIT;
