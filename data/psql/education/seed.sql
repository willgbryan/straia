-- Seed data for education database
-- This data is designed to support the Analyst feature demo
-- Particularly the first-gen commuter student risk analysis use case

-- Insert terms (semesters)
INSERT INTO terms (name, start_date, end_date, is_current) VALUES
('Fall 2024', '2024-08-25', '2024-12-15', FALSE),
('Spring 2025', '2025-01-15', '2025-05-10', TRUE),
('Fall 2025', '2025-08-25', '2025-12-15', FALSE);

-- Insert some advisors
INSERT INTO advisors (first_name, last_name, department, students_assigned) VALUES
('Sarah', 'Johnson', 'Computer Science', 45),
('Michael', 'Rodriguez', 'Business', 52),
('David', 'Chen', 'Engineering', 38),
('Emily', 'Williams', 'Arts & Humanities', 40),
('Robert', 'Martinez', 'Sciences', 35);

-- Function to generate random students
CREATE OR REPLACE FUNCTION generate_random_students(num_students INTEGER) RETURNS VOID AS $$
DECLARE
    majors TEXT[] := ARRAY['Computer Science', 'Business', 'Engineering', 'Psychology', 'Biology', 
                         'Mathematics', 'English', 'History', 'Chemistry', 'Art', 'Economics', 
                         'Physics', 'Political Science', 'Sociology', 'Communications'];
    genders TEXT[] := ARRAY['Male', 'Female', 'Non-binary'];
    first_names TEXT[] := ARRAY['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 
                               'Joseph', 'Thomas', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 
                               'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Lisa', 'Miguel', 'José', 
                               'María', 'Juan', 'Carlos', 'Wei', 'Li', 'Yan', 'Zhang', 'Liu', 'Abdul', 
                               'Fatima', 'Mohammad', 'Omar', 'Aisha'];
    last_names TEXT[] := ARRAY['Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 
                              'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 
                              'Harris', 'Garcia', 'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 
                              'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Scott', 
                              'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Wang', 'Li', 
                              'Zhang', 'Chen', 'Liu', 'Ali', 'Khan', 'Ahmed', 'Rahman', 'Singh'];
    parent_education_levels TEXT[] := ARRAY['No High School', 'High School', 'Some College', 'Associate''s Degree', 
                                         'Bachelor''s Degree', 'Master''s Degree', 'Doctoral Degree'];
    housing_statuses TEXT[] := ARRAY['on_campus', 'off_campus'];
    financial_aid_statuses TEXT[] := ARRAY['None', 'Loans', 'Grants', 'Scholarship', 'Work Study', 'Multiple'];
    
    i INTEGER;
    student_record_id INTEGER;
    first_name TEXT;
    last_name TEXT;
    email TEXT;
    gender TEXT;
    dob DATE;
    enrollment_date DATE;
    expected_graduation DATE;
    major TEXT;
    gpa NUMERIC;
    credits_completed INTEGER;
    parent_education_level TEXT;
    housing_status TEXT;
    zip_code TEXT;
    is_international BOOLEAN;
    financial_aid_status TEXT;
    
BEGIN
    FOR i IN 1..num_students LOOP
        -- Choose random values for each student
        first_name := first_names[1 + floor(random() * array_length(first_names, 1))];
        last_name := last_names[1 + floor(random() * array_length(last_names, 1))];
        email := lower(first_name) || '.' || lower(last_name) || i || '@university.edu';
        gender := genders[1 + floor(random() * array_length(genders, 1))];
        dob := (CURRENT_DATE - ((18 + floor(random() * 12)) * INTERVAL '1 year')) - (floor(random() * 365) * INTERVAL '1 day');
        enrollment_date := '2023-08-15'::DATE + (floor(random() * 540) * INTERVAL '1 day');
        expected_graduation := enrollment_date + ((3 + floor(random() * 3)) * INTERVAL '1 year');
        major := majors[1 + floor(random() * array_length(majors, 1))];
        gpa := 2.0 + random() * 2.0; -- GPA between 2.0 and 4.0
        credits_completed := floor(random() * 120);
        
        -- Set parent education level - make 30% first-gen (no bachelor's degree)
        IF random() < 0.3 THEN
            parent_education_level := parent_education_levels[1 + floor(random() * 4)]; -- First 4 are below Bachelor's
        ELSE
            parent_education_level := parent_education_levels[5 + floor(random() * 3)]; -- Bachelor's or higher
        END IF;
        
        -- Set housing status - make 60% off-campus
        housing_status := CASE WHEN random() < 0.6 THEN 'off_campus' ELSE 'on_campus' END;
        
        -- Generate zip codes - make 70% of off-campus students have local zip codes (commuters)
        -- Local zip codes will start with 123 for easy identification
        IF housing_status = 'off_campus' AND random() < 0.7 THEN
            zip_code := '123' || LPAD(floor(random() * 100)::TEXT, 2, '0');
        ELSE
            zip_code := LPAD(floor(random() * 100000)::TEXT, 5, '0');
        END IF;
        
        is_international := random() < 0.1; -- 10% international students
        financial_aid_status := financial_aid_statuses[1 + floor(random() * array_length(financial_aid_statuses, 1))];
        
        -- Insert the student
        INSERT INTO students (
            first_name, last_name, email, gender, date_of_birth, 
            enrollment_date, expected_graduation, major, gpa, credits_completed,
            parent_education_level, housing_status, zip_code, is_international, financial_aid_status
        ) VALUES (
            first_name, last_name, email, gender, dob, 
            enrollment_date, expected_graduation, major, gpa, credits_completed,
            parent_education_level, housing_status, zip_code, is_international, financial_aid_status
        ) RETURNING students.student_id INTO student_record_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Generate 1000 random students
SELECT generate_random_students(1000);

-- Insert courses
INSERT INTO courses (course_code, course_name, department, credits, term_id) VALUES
('CS101', 'Introduction to Computer Science', 'Computer Science', 3, 2),
('BUS200', 'Business Fundamentals', 'Business', 3, 2),
('ENG150', 'Engineering Principles', 'Engineering', 4, 2),
('PSYCH101', 'Introduction to Psychology', 'Psychology', 3, 2),
('BIO101', 'Introduction to Biology', 'Biology', 4, 2),
('MATH201', 'Calculus I', 'Mathematics', 4, 2),
('ENG101', 'Composition', 'English', 3, 2),
('HIST100', 'World History', 'History', 3, 2),
('CHEM101', 'General Chemistry', 'Chemistry', 4, 2),
('ART110', 'Introduction to Art', 'Art', 3, 2),
('ECON101', 'Microeconomics', 'Economics', 3, 2),
('PHYS101', 'Physics I', 'Physics', 4, 2),
('POLS101', 'American Government', 'Political Science', 3, 2),
('SOC101', 'Introduction to Sociology', 'Sociology', 3, 2),
('COMM101', 'Public Speaking', 'Communications', 3, 2);

-- Generate enrollments and advising sessions
DO $$
DECLARE
    student_record RECORD;
    advisor_id INTEGER;
    course_count INTEGER;
    attendance_rate NUMERIC;
    assignment_completion NUMERIC;
    last_login_days INTEGER;
    grade_options TEXT[] := ARRAY['A', 'B', 'C', 'D', 'F', 'W'];
    session_status_options TEXT[] := ARRAY['attended', 'missed', 'rescheduled'];
BEGIN
    -- Loop through all students
    FOR student_record IN SELECT student_id, gpa FROM students LOOP
        -- Assign random advisor
        advisor_id := 1 + floor(random() * 5);
        
        -- Determine how many courses they're taking (3-5)
        course_count := 3 + floor(random() * 3);
        
        -- For each course, create an enrollment
        FOR i IN 1..course_count LOOP
            -- Determine risk factors based partly on GPA
            -- Lower GPA students more likely to have poor attendance, etc.
            IF student_record.gpa < 3.0 THEN
                attendance_rate := 40 + (random() * 40); -- 40-80%
                assignment_completion := 40 + (random() * 40); -- 40-80%
                last_login_days := 10 + floor(random() * 20); -- 10-30 days ago
            ELSE
                attendance_rate := 70 + (random() * 25); -- 70-95%
                assignment_completion := 70 + (random() * 25); -- 70-95%
                last_login_days := 1 + floor(random() * 10); -- 1-10 days ago
            END IF;
            
            -- Insert enrollment record
            INSERT INTO enrollments (
                student_id, course_id, term_id, grade, 
                attendance_rate, last_login, assignment_completion
            ) VALUES (
                student_record.student_id, 
                1 + floor(random() * 15), -- Random course
                2, -- Spring 2025
                grade_options[1 + floor(random() * array_length(grade_options, 1))],
                attendance_rate,
                CURRENT_DATE - (last_login_days * INTERVAL '1 day'),
                assignment_completion
            );
        END LOOP;
        
        -- Create 1-3 advising sessions for each student
        FOR i IN 1..1 + floor(random() * 3) LOOP
            INSERT INTO advising_sessions (
                student_id, advisor_id, date, duration_minutes, 
                notes, status
            ) VALUES (
                student_record.student_id,
                advisor_id,
                CURRENT_DATE - (floor(random() * 100) * INTERVAL '1 day'),
                15 + floor(random() * 30),
                'Discussion about academic progress and course selection.',
                session_status_options[1 + floor(random() * array_length(session_status_options, 1))]
            );
        END LOOP;
    END LOOP;
END $$;

-- Create specific retention risk examples for our use case
-- First, identify first-gen commuter students
DO $$
DECLARE
    at_risk_count INTEGER := 0;
    student_record RECORD;
BEGIN
    -- Loop through first-gen commuter students (parent education below Bachelor's, off-campus, local zip)
    FOR student_record IN 
        SELECT s.student_id 
        FROM students s
        WHERE s.parent_education_level IN ('No High School', 'High School', 'Some College', 'Associate''s Degree')
        AND s.housing_status = 'off_campus'
        AND s.zip_code LIKE '123%'
    LOOP
        -- Set specific risk factors for 76% of these students
        -- This will match our sample results from the mockData
        IF random() < 0.76 AND at_risk_count < 200 THEN
            -- Risk factor 1: Missed advising check-ins
            UPDATE advising_sessions
            SET status = 'missed'
            WHERE student_id = student_record.student_id
            AND random() < 0.7;

            -- Risk factor 2: Low LMS activity (no recent logins)
            UPDATE enrollments
            SET last_login = CURRENT_DATE - ((10 + floor(random() * 20)) * INTERVAL '1 day'),
                attendance_rate = 50 + (random() * 20),
                assignment_completion = 50 + (random() * 20)
            WHERE student_id = student_record.student_id;
            
            at_risk_count := at_risk_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Created % at-risk first-gen commuter students', at_risk_count;
END $$;

-- Create view to calculate retention rates by cohort
CREATE OR REPLACE VIEW retention_rates AS
SELECT 
    CASE 
        WHEN s.parent_education_level IN ('No High School', 'High School', 'Some College', 'Associate''s Degree')
            AND s.housing_status = 'off_campus' 
            AND s.zip_code LIKE '123%' THEN 'First-Gen Commuters'
        ELSE 'All Undergraduates'
    END AS cohort,
    COUNT(*) AS total_students,
    SUM(CASE 
        WHEN EXISTS (
            SELECT 1 FROM enrollments e 
            WHERE e.student_id = s.student_id 
            AND e.term_id = 2
            AND e.last_login > CURRENT_DATE - INTERVAL '10 days'
            AND e.attendance_rate > 70 
        ) THEN 1 
        ELSE 0 
    END) AS retained_students,
    ROUND(
        SUM(CASE 
            WHEN EXISTS (
                SELECT 1 FROM enrollments e 
                WHERE e.student_id = s.student_id 
                AND e.term_id = 2
                AND e.last_login > CURRENT_DATE - INTERVAL '10 days'
                AND e.attendance_rate > 70 
            ) THEN 1 
            ELSE 0 
        END)::NUMERIC / COUNT(*)::NUMERIC * 100
    ) AS retention_rate
FROM 
    students s
GROUP BY 
    cohort; 