/*
  STICHA Supabase integration starter.
  This file is intentionally NOT loaded by the offline app yet.
  Add @supabase/supabase-js v2 with your preferred bundler/CDN, then connect these functions.
*/

// Example with a module-capable setup:
// import { createClient } from '@supabase/supabase-js';
// import config from './supabase-config.js';
// const supabase = createClient(config.url, config.anonKey);

async function signUp(supabase, email, password, fullName, businessName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, business_name: businessName } }
  });
  if (error) throw error;
  return data;
}

async function signIn(supabase, email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function loadCloudCustomers(supabase) {
  const { data: customers, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ids = customers.map(c => c.id);
  if (!ids.length) return [];

  const { data: measurements, error: measurementError } = await supabase
    .from('measurements')
    .select('*')
    .in('customer_id', ids)
    .order('measured_at', { ascending: false });
  if (measurementError) throw measurementError;

  return customers.map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone || '',
    gender: c.gender || '',
    category: c.category || 'Custom',
    photo: c.photo_url || '',
    unit: c.unit || 'in',
    notes: c.notes || '',
    startDate: c.start_date || '',
    deliveryDate: c.delivery_date || '',
    price: c.order_price || '',
    paid: c.amount_paid || '',
    status: c.order_status || 'In progress',
    measurements: measurements.find(m => m.customer_id === c.id)?.values || {},
    customMeasurements: measurements.find(m => m.customer_id === c.id)?.custom_values || [],
    history: measurements.filter(m => m.customer_id === c.id).slice(1).map(m => ({
      date: m.measured_at,
      unit: m.unit,
      measurements: m.values,
      customMeasurements: m.custom_values
    }))
  }));
}

async function upsertCustomer(supabase, customer, userId) {
  const { data, error } = await supabase.from('customers').upsert({
    id: customer.id,
    user_id: userId,
    name: customer.name,
    phone: customer.phone || null,
    gender: customer.gender || null,
    category: customer.category || null,
    photo_url: customer.photo || null,
    unit: customer.unit || 'in',
    notes: customer.notes || null,
    start_date: customer.startDate || null,
    delivery_date: customer.deliveryDate || null,
    order_price: Number(customer.price || 0),
    amount_paid: Number(customer.paid || 0),
    order_status: customer.status || 'In progress',
    updated_at: new Date().toISOString()
  }).select().single();
  if (error) throw error;
  return data;
}

async function saveMeasurementSet(supabase, customer, userId, garmentType='Custom') {
  const { data, error } = await supabase.from('measurements').insert({
    user_id: userId,
    customer_id: customer.id,
    garment_type: garmentType,
    unit: customer.unit || 'in',
    values: customer.measurements || {},
    custom_values: customer.customMeasurements || []
  }).select().single();
  if (error) throw error;
  return data;
}

window.STICHA_SUPABASE = { signUp, signIn, loadCloudCustomers, upsertCustomer, saveMeasurementSet };
