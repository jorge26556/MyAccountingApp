import { supabase } from '../lib/supabase';
import type { Category, PaymentStatus, Transaction, TransactionType, SavingsGoal } from '../types';

const DEFAULT_CATEGORY_NAMES = ['Arriendo', 'Mercado', 'Servicios', 'Salidas', 'Viajes', 'Extra'];
const CATEGORY_STORAGE_KEY = 'my-accounting-app.categories';

const normalizeCategoryName = (value: string) => value.trim();

const createLocalCategory = (name: string): Category => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${name}`,
  name,
});

const buildDefaultCategories = (): Category[] => DEFAULT_CATEGORY_NAMES.map(createLocalCategory);

const getStorageKey = (userId: string) => `${CATEGORY_STORAGE_KEY}.${userId}`;

const readLocalCategories = (userId: string): Category[] => {
  if (typeof localStorage === 'undefined') {
    return buildDefaultCategories();
  }

  const storageKey = getStorageKey(userId);
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    const defaults = buildDefaultCategories();
    localStorage.setItem(storageKey, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Category[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const defaults = buildDefaultCategories();
      localStorage.setItem(storageKey, JSON.stringify(defaults));
      return defaults;
    }

    return parsed
      .map(item => ({ id: item.id, name: normalizeCategoryName(item.name) }))
      .filter(item => item.name.length > 0);
  } catch {
    const defaults = buildDefaultCategories();
    localStorage.setItem(storageKey, JSON.stringify(defaults));
    return defaults;
  }
};

const writeLocalCategories = (userId: string, categories: Category[]) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(getStorageKey(userId), JSON.stringify(categories));
};

const dedupeCategories = (categories: Category[]) => {
  const seen = new Set<string>();
  return categories.filter(category => {
    const normalized = normalizeCategoryName(category.name).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
};

const mapTransaction = (item: any): Transaction => ({
  ...item,
  id: item.id,
  fecha: new Date(item.fecha),
  tipo: item.tipo as TransactionType,
  estado_pago: item.estado_pago as PaymentStatus,
});

export const fetchTransactions = async (): Promise<Transaction[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('fecha', { ascending: false });

  if (error) {
    console.error('Error fetching transactions:', error);
    throw new Error('Error al cargar datos de Supabase');
  }

  return (data || []).map(mapTransaction);
};

export const fetchCategories = async (): Promise<Category[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return buildDefaultCategories();

  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (error) {
    console.warn('Categories table unavailable, using local fallback:', error.message);
    return dedupeCategories(readLocalCategories(user.id));
  }

  if (!data || data.length === 0) {
    const defaults = buildDefaultCategories();
    const { data: inserted, error: insertError } = await supabase
      .from('categories')
      .insert(defaults.map(category => ({ user_id: user.id, name: category.name })))
      .select('id, name')
      .order('name', { ascending: true });

    if (insertError) {
      console.warn('Could not seed categories in Supabase, using local fallback:', insertError.message);
      writeLocalCategories(user.id, defaults);
      return defaults;
    }

    return (inserted || []).map(item => ({ id: item.id, name: normalizeCategoryName(item.name) }));
  }

  return dedupeCategories(data.map(item => ({ id: item.id, name: normalizeCategoryName(item.name) })));
};

export const createCategory = async (name: string): Promise<Category> => {
  const normalizedName = normalizeCategoryName(name);
  if (!normalizedName) {
    throw new Error('La categoria es obligatoria');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const existingLocal = readLocalCategories(user.id);
  const duplicated = existingLocal.some(category => category.name.toLowerCase() === normalizedName.toLowerCase());
  if (duplicated) {
    throw new Error('Esa categoria ya existe');
  }

  const { data, error } = await supabase
    .from('categories')
    .insert([{ user_id: user.id, name: normalizedName }])
    .select('id, name')
    .single();

  if (error) {
    console.warn('Could not persist category in Supabase, using local fallback:', error.message);
    const created = createLocalCategory(normalizedName);
    writeLocalCategories(user.id, dedupeCategories([...existingLocal, created]));
    return created;
  }

  const created = { id: data.id, name: normalizeCategoryName(data.name) };
  writeLocalCategories(user.id, dedupeCategories([...existingLocal, created]));
  return created;
};

export const deleteCategory = async (name: string): Promise<void> => {
  const normalizedName = normalizeCategoryName(name);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const currentLocal = readLocalCategories(user.id);
  if (currentLocal.length <= 1) {
    throw new Error('Debe existir al menos una categoria disponible');
  }

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('user_id', user.id)
    .eq('name', normalizedName);

  if (error) {
    console.warn('Could not delete category in Supabase, using local fallback:', error.message);
  }

  writeLocalCategories(
    user.id,
    currentLocal.filter(category => category.name.toLowerCase() !== normalizedName.toLowerCase())
  );
};

export const createTransaction = async (transaction: Omit<Transaction, 'id' | 'user_id'>): Promise<Transaction> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      ...transaction,
      user_id: user.id,
      fecha: transaction.fecha.toISOString().split('T')[0],
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating transaction:', error);
    throw new Error('Error al guardar en Supabase');
  }

  return mapTransaction(data);
};

export const updateTransaction = async (
  id: string,
  changes: Partial<Omit<Transaction, 'id' | 'user_id'>>
): Promise<Transaction> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const payload = { ...changes } as Record<string, unknown>;
  if (changes.fecha instanceof Date) {
    payload.fecha = changes.fecha.toISOString().split('T')[0];
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating transaction:', error);
    throw new Error('Error al actualizar en Supabase');
  }

  return mapTransaction(data);
};

export const deleteTransaction = async (id: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error deleting transaction:', error);
    throw new Error('Error al eliminar de Supabase');
  }
};

export const fetchSavingsGoals = async (): Promise<SavingsGoal[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching savings goals:', error);
    throw new Error('Error al cargar metas de ahorro desde Supabase');
  }

  return data || [];
};

export const createSavingsGoal = async (goal: Omit<SavingsGoal, 'id'>): Promise<SavingsGoal> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { data, error } = await supabase
    .from('savings_goals')
    .insert([{
      name: goal.name,
      amount: goal.amount,
      user_id: user.id
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating savings goal:', error);
    throw new Error('Error al crear meta de ahorro');
  }

  return data;
};

export const updateSavingsGoal = async (id: string, updates: Partial<Omit<SavingsGoal, 'id'>>): Promise<SavingsGoal> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { data, error } = await supabase
    .from('savings_goals')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating savings goal:', error);
    throw new Error('Error al actualizar meta de ahorro');
  }

  return data;
};

export const deleteSavingsGoal = async (id: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { error } = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error deleting savings goal:', error);
    throw new Error('Error al eliminar meta de ahorro');
  }
};

