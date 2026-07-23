-- El padron RNOS/RNAS sembrado en 043 es SOLO de obras sociales sindicales.
-- Las prepagas (Swiss Medical, Galeno, Medife, etc.) se registran en un
-- padron distinto (entidades de medicina prepaga) que no se descargo en
-- ese seed, y por eso el buscador no las encontraba. Se agregan las
-- principales prepagas de Argentina como catalogo curado manualmente.
--
-- Tambien se corrige PAMI: el nombre legal real es "Instituto Nacional de
-- Servicios Sociales para Jubilados y Pensionados" y el dataset fuente no
-- traia la sigla PAMI, asi que nadie lo iba a encontrar buscando "PAMI".

update public.health_coverages
set name = 'INSTITUTO NACIONAL DE SERVICIOS SOCIALES PARA JUBILADOS Y PENSIONADOS (PAMI)',
    normalized_name = 'INSTITUTO NACIONAL DE SERVICIOS SOCIALES PARA JUBILADOS Y PENSIONADOS (PAMI)',
    updated_at = now()
where rnos_code = '500807' and name not ilike '%PAMI%';

insert into public.health_coverages (name, normalized_name, type, source)
values
('SWISS MEDICAL', 'SWISS MEDICAL', 'prepaga', 'manual_curated'),
('GALENO', 'GALENO', 'prepaga', 'manual_curated'),
('MEDIFE', 'MEDIFE', 'prepaga', 'manual_curated'),
('OMINT', 'OMINT', 'prepaga', 'manual_curated'),
('SANCOR SALUD', 'SANCOR SALUD', 'prepaga', 'manual_curated'),
('ACCORD SALUD', 'ACCORD SALUD', 'prepaga', 'manual_curated'),
('PREVENCION SALUD', 'PREVENCION SALUD', 'prepaga', 'manual_curated'),
('AVALIAN (EX MEDICUS)', 'AVALIAN (EX MEDICUS)', 'prepaga', 'manual_curated'),
('DOCTHOS', 'DOCTHOS', 'prepaga', 'manual_curated'),
('FEDERADA SALUD', 'FEDERADA SALUD', 'prepaga', 'manual_curated'),
('JERARQUICOS SALUD', 'JERARQUICOS SALUD', 'prepaga', 'manual_curated'),
('HOSPITAL ITALIANO PLAN DE SALUD', 'HOSPITAL ITALIANO PLAN DE SALUD', 'prepaga', 'manual_curated'),
('HOSPITAL ALEMAN PLAN DE SALUD', 'HOSPITAL ALEMAN PLAN DE SALUD', 'prepaga', 'manual_curated'),
('APRES', 'APRES', 'prepaga', 'manual_curated'),
('CENTER SALUD', 'CENTER SALUD', 'prepaga', 'manual_curated'),
('VITTAL', 'VITTAL', 'prepaga', 'manual_curated')
on conflict (normalized_name) do nothing;
