/*
  # Fix Organisation Member Status
  
  1. Problem
    - When organisations are created in admin console with existing users as owners
    - The membership status was set to 'invited' instead of 'active'
    - This prevents users from seeing their organisations in the main app
    
  2. Solution
    - Update all 'invited' memberships to 'active' where the user already exists
    - This allows existing users to immediately access their organisations
    
  3. Changes
    - Updates organisation_members status from 'invited' to 'active' for existing users
*/

-- Update existing memberships where users already exist in the system
UPDATE organisation_members
SET status = 'active'
WHERE status = 'invited'
AND user_id IN (
  SELECT id 
  FROM auth.users 
  WHERE id IS NOT NULL
);
