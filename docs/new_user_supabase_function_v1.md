# This is the `handle_new_user` command from Supabase
This updates other tables when a new user is created


```js
DECLARE
    new_account_id uuid;
    parent_account_id uuid;
BEGIN
    -- Extract the optional parent account ID from the metadata if provided
    parent_account_id := (new.raw_user_meta_data->>'parent_account_id')::uuid;

    -- 1. Create the Public Profile
    INSERT INTO public.profiles (id, full_name, username, email)
    VALUES (
        new.id, 
        new.raw_user_meta_data->>'full_name', 
        new.raw_user_meta_data->>'username',
        new.email
    );

    -- 2. Create the Personal Workspace (Their own sandbox playground)
    INSERT INTO public.accounts (name, is_personal, plan_name, subscription_status)
    VALUES (
        COALESCE(
            new.raw_user_meta_data->>'account_name', 
            (new.raw_user_meta_data->>'full_name' || ' Workspace'),
            'My Workspace'
        ),  
        TRUE, 
        'free',
        'active'
    )
    RETURNING id INTO new_account_id;

    -- 3. Make them the OWNER of their personal playground
    INSERT INTO public.memberships (account_id, user_id, role)
    VALUES (new_account_id, new.id, 'owner');

    -- 4. CONDITIONAL STEP: Link them to the corporate parent if invited
    IF parent_account_id IS NOT NULL THEN
        INSERT INTO public.memberships (account_id, user_id, role)
        VALUES (parent_account_id, new.id, 'member'); -- Safely hardcoded as 'member'

        -- CLEANUP LINE: Invalidate invite token so it can never be recycled
        UPDATE public.invitations
        SET accepted = TRUE
        WHERE account_id = parent_account_id AND email = new.email;
    END IF;

    RETURN new;
END;
```