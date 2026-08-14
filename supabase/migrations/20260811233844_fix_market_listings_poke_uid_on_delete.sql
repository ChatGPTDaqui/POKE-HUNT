
alter table dev.market_listings alter column poke_uid drop not null;
alter table dev.market_listings drop constraint market_listings_poke_uid_fkey;
alter table dev.market_listings add constraint market_listings_poke_uid_fkey
  foreign key (poke_uid) references dev.pokemon_instances(id) on delete set null;
