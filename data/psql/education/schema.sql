-- Education Database Schema
-- This schema represents a higher education institution's data structure
-- It's designed to work with the Analyst feature for natural language queries

-- Students table
CREATE TABLE students (
    student_id SERIAL PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    gender VARCHAR(50),
    date_of_birth DATE,
    enrollment_date DATE NOT NULL,
    expected_graduation DATE,
    major VARCHAR(255),
    gpa NUMERIC(3,2),
    credits_completed INTEGER DEFAULT 0,
    parent_education_level VARCHAR(255), -- For first-gen identification
    housing_status VARCHAR(50),          -- 'on_campus', 'off_campus'
    zip_code VARCHAR(20),
    is_international BOOLEAN DEFAULT FALSE,
    financial_aid_status VARCHAR(50)
);

-- Courses table
CREATE TABLE courses (
    course_id SERIAL PRIMARY KEY,
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(255) NOT NULL, 
    department VARCHAR(100) NOT NULL,
    credits INTEGER NOT NULL,
    term_id INTEGER NOT NULL
);

-- Terms table
CREATE TABLE terms (
    term_id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,       -- e.g., "Fall 2024"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN DEFAULT FALSE
);

-- Enrollments table 
CREATE TABLE enrollments (
    enrollment_id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(student_id),
    course_id INTEGER REFERENCES courses(course_id),
    term_id INTEGER REFERENCES terms(term_id),
    grade VARCHAR(5),
    attendance_rate NUMERIC(5,2),    -- percentage
    last_login DATE,
    assignment_completion NUMERIC(5,2) -- percentage
);

-- Advisors table
CREATE TABLE advisors (
    advisor_id SERIAL PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    students_assigned INTEGER DEFAULT 0
);

-- Advising sessions table
CREATE TABLE advising_sessions (
    session_id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(student_id),
    advisor_id INTEGER REFERENCES advisors(advisor_id),
    date DATE NOT NULL,
    duration_minutes INTEGER,
    notes TEXT,
    status VARCHAR(20) NOT NULL -- 'attended', 'missed', 'rescheduled'
);

-- Add indexes for performance
CREATE INDEX idx_students_major ON students(major);
CREATE INDEX idx_students_housing ON students(housing_status);
CREATE INDEX idx_students_parent_education ON students(parent_education_level);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_term ON enrollments(term_id);
CREATE INDEX idx_advising_sessions_student ON advising_sessions(student_id);
CREATE INDEX idx_advising_sessions_status ON advising_sessions(status); 