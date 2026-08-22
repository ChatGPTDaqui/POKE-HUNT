-- PH-67: espelho dev da migration irma em public — ver aquela pro raciocinio completo.
revoke execute on function dev.gravar_progresso(uuid, jsonb, timestamptz) from anon, authenticated;
