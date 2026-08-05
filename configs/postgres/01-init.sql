-- CloudDecept PostgreSQL initialization
-- Creates tables for threat intelligence and session metadata

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Threat intelligence table
CREATE TABLE IF NOT EXISTS threat_intelligence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    technique_id VARCHAR(50) NOT NULL,
    technique_name VARCHAR(255),
    tactic VARCHAR(100),
    confidence FLOAT,
    iocs JSONB,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_threat_intel_session ON threat_intelligence(session_id);
CREATE INDEX idx_threat_intel_technique ON threat_intelligence(technique_id);
CREATE INDEX idx_threat_intel_created ON threat_intelligence(created_at);

-- Session metadata table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    source_ip VARCHAR(45),
    source_port INTEGER,
    destination_port INTEGER,
    protocol VARCHAR(20) DEFAULT 'ssh',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    commands_executed INTEGER DEFAULT 0,
    unique_commands INTEGER DEFAULT 0,
    credentials_tried JSONB,
    cloud_apis_called JSONB,
    intent_classifications JSONB,
    adaptations_applied JSONB,
    threat_score FLOAT DEFAULT 0.0,
    summary TEXT,
    country VARCHAR(100),
    asn VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_started ON sessions(started_at);
CREATE INDEX idx_sessions_source_ip ON sessions(source_ip);

-- IOC table
CREATE TABLE IF NOT EXISTS indicators_of_compromise (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    ioc_type VARCHAR(50) NOT NULL,
    ioc_value TEXT NOT NULL,
    confidence FLOAT DEFAULT 1.0,
    context JSONB,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ioc_session ON indicators_of_compromise(session_id);
CREATE INDEX idx_ioc_type_value ON indicators_of_compromise(ioc_type, ioc_value);
CREATE INDEX idx_ioc_first_seen ON indicators_of_compromise(first_seen);

-- Intent predictions table
CREATE TABLE IF NOT EXISTS intent_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    command_sequence TEXT,
    predicted_intent VARCHAR(100),
    confidence FLOAT,
    reasoning TEXT,
    mitigations JSONB,
    model_used VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_intent_session ON intent_predictions(session_id);
CREATE INDEX idx_intent_created ON intent_predictions(created_at);

-- Adaptation events table
CREATE TABLE IF NOT EXISTS adaptation_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    strategy VARCHAR(100) NOT NULL,
    parameters JSONB,
    result JSONB,
    success BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_adaptation_session ON adaptation_events(session_id);
CREATE INDEX idx_adaptation_strategy ON adaptation_events(strategy);
CREATE INDEX idx_adaptation_created ON adaptation_events(created_at);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO clouddecept;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO clouddecept;
