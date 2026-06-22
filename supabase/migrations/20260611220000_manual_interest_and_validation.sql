-- 1. Fallback senza smartwatch: reazioni "manuali" accanto a quelle cardiache.
--    Le righe manual hanno z_score/peak_bpm null; la colonna source le distingue.

alter table public.biometric_reactions
  add column if not exists source text not null default 'cardiac';

alter table public.biometric_reactions
  add constraint biometric_reactions_source_check
  check (source in ('cardiac', 'manual'));

alter table public.biometric_reactions alter column z_score drop not null;
alter table public.biometric_reactions alter column peak_bpm drop not null;
alter table public.biometric_reactions alter column baseline_mean drop not null;
alter table public.biometric_reactions alter column baseline_std drop not null;

-- 2. Validazione server-side: il client non è fidato.
--    - sanity check sui valori (z_score e BPM plausibili)
--    - cooldown 20s per coppia viewer/profilo
--    - rate limit 30 reazioni/ora per viewer

create or replace function public.validate_biometric_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_pair_count int;
  hourly_count int;
begin
  if new.source = 'cardiac' then
    if new.z_score is null or new.z_score < 0 or new.z_score > 6 then
      raise exception 'invalid z_score';
    end if;
    if new.peak_bpm is null or new.peak_bpm < 30 or new.peak_bpm > 220 then
      raise exception 'invalid peak_bpm';
    end if;
  else
    -- manual: nessun dato biometrico ammesso
    if new.z_score is not null or new.peak_bpm is not null then
      raise exception 'manual reactions must not carry biometric values';
    end if;
  end if;

  -- cooldown: max 1 reazione ogni 20s verso lo stesso profilo
  select count(*) into recent_pair_count
  from public.biometric_reactions
  where viewer_id = new.viewer_id
    and profile_id = new.profile_id
    and created_at > now() - interval '20 seconds';
  if recent_pair_count > 0 then
    raise exception 'reaction cooldown active';
  end if;

  -- rate limit: max 30 reazioni/ora per utente
  select count(*) into hourly_count
  from public.biometric_reactions
  where viewer_id = new.viewer_id
    and created_at > now() - interval '1 hour';
  if hourly_count >= 30 then
    raise exception 'hourly reaction limit reached';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_biometric_reaction_trg on public.biometric_reactions;
create trigger validate_biometric_reaction_trg
  before insert on public.biometric_reactions
  for each row execute function public.validate_biometric_reaction();
