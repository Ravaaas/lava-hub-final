import { createClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';

// La clé « anon » est publique par conception : les droits sont appliqués par la RLS de la base.
// Ne jamais mettre ici la clé service_role.
const SUPABASE_URL = 'https://qmvxmxzsmpigvseuidcd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdnhteHpzbXBpZ3ZzZXVpZGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTY1ODYsImV4cCI6MjA5NzI5MjU4Nn0._kDu_tyJbr9Hcckg_dC0OYsSqh23aPND96wMX_KLdAc';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
