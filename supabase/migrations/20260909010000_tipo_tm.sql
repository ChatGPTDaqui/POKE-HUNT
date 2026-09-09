-- PH-512: enum antes da migration que usa o novo valor.
alter type public.item_kind add value if not exists 'tm';
alter type dev.item_kind add value if not exists 'tm';
