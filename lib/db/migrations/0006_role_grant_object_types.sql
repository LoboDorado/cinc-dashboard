-- Populated only for *_object_manager grants. Sandboxes always follow
-- Cookbook permissions (no separate type) and Groups are deliberately not
-- delegable via Object Manager (Org Admin and above only) -- see the RBAC
-- model in the plan.
CREATE TABLE role_grant_object_types (
    role_grant_id uuid NOT NULL REFERENCES role_grants(id) ON DELETE CASCADE,
    object_type text NOT NULL CHECK (object_type IN (
        'nodes', 'cookbooks', 'cookbook_artifacts', 'roles', 'environments',
        'data_bags', 'clients', 'policies', 'policy_groups'
    )),
    PRIMARY KEY (role_grant_id, object_type)
);
