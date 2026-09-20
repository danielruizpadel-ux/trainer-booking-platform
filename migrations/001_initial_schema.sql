-- =====================================================================
--  ATENCION: ESTA MIGRACION NO REFLEJA LO QUE HAY DESPLEGADO.
--
--  Nunca se aplico tal cual. El proyecto real NO tiene tabla `clients`,
--  y `reservations` NO tiene `client_id`, `session_date`, `session_time`,
--  `class_type` ni `client_whatsapp_opt_in`. Los datos de contacto viven
--  en la propia fila de `reservations`.
--
--  Programar contra este archivo ya rompio la reserva una vez.
--  El esquema de referencia es docs/DATABASE.md.
--
--  Se conserva solo como historico.
-- =====================================================================

-- Create trainers table
CREATE TABLE IF NOT EXISTS trainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bio TEXT,
  image_url TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'professional')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'inactive', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  total_reservations INT DEFAULT 0,
  last_reservation_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create availability_slots table
CREATE TABLE IF NOT EXISTS availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  class_type TEXT NOT NULL CHECK (class_type IN ('individual', 'group', 'semi-private')),
  max_capacity INT DEFAULT 1,
  current_bookings INT DEFAULT 0,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'full', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trainer_id, session_date, start_time, class_type)
);

-- Create reservations table
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  availability_slot_id UUID REFERENCES availability_slots(id) ON DELETE SET NULL,
  session_date DATE NOT NULL,
  session_time TIME NOT NULL,
  class_type TEXT NOT NULL CHECK (class_type IN ('individual', 'group', 'semi-private')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better query performance
CREATE INDEX idx_trainers_subscription_status ON trainers(subscription_status);
CREATE INDEX idx_availability_slots_trainer_date ON availability_slots(trainer_id, session_date);
CREATE INDEX idx_reservations_trainer ON reservations(trainer_id);
CREATE INDEX idx_reservations_client ON reservations(client_id);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_session_date ON reservations(session_date);

-- Enable Row Level Security (RLS) for multi-tenant
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Create policies for trainers (each trainer can only see their own data)
CREATE POLICY "Trainers can read their own data" ON trainers
  FOR SELECT USING (true); -- For now, allow read. Add auth context later.

CREATE POLICY "Public can read active trainers" ON trainers
  FOR SELECT USING (status = 'active');

-- Create policies for availability slots
CREATE POLICY "Public can read available slots" ON availability_slots
  FOR SELECT USING (status = 'available');

-- Create policies for reservations
CREATE POLICY "Anyone can create reservations" ON reservations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Can read own reservations" ON reservations
  FOR SELECT USING (true);

-- Add created_at and updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
CREATE TRIGGER update_trainers_updated_at BEFORE UPDATE ON trainers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_availability_slots_updated_at BEFORE UPDATE ON availability_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
