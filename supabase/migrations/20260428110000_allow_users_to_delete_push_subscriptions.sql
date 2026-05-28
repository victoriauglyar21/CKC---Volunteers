create policy "Users can delete their subscriptions"
on public.push_subscriptions
for delete
using (auth.uid() = user_id);
