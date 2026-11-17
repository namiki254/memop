-- 既存の is_map_admin() がある Supabase プロジェクトの SQL Editor で全体を実行する。
begin;

-- 1. 投稿者本人または管理者が、選んだコメントの本文だけを変更できるようにする。
create or replace function public.edit_pin_comment(
  target_comment_id text,
  expected_content text,
  new_content text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  editor_id uuid := auth.uid();
  editor_is_admin boolean;
  comment_id public.pin_comments.id%type;
  trimmed_content text;
  saved_content text;
begin
  if editor_id is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  editor_is_admin := public.is_map_admin() is true;

  -- 改行・タブ・全角空白を含め、空白だけの本文は保存しない。
  trimmed_content := regexp_replace(new_content, '^[[:space:]　]+|[[:space:]　]+$', '', 'g');
  if trimmed_content is null or trimmed_content = '' then
    raise exception 'empty_comment' using errcode = '22023';
  end if;

  comment_id := target_comment_id;
  -- 編集中に他の人が本文を更新していた場合は、その変更を上書きしない。
  -- 本文だけを更新するので、投稿者・投稿先・投稿日時はそのまま残る。
  update public.pin_comments as comment
  set content = trimmed_content
  where comment.id = comment_id
    and (editor_is_admin or comment.user_id = editor_id)
    and comment.content is not distinct from expected_content
  returning comment.content into saved_content;

  return saved_content;
end;
$function$;

-- 2. ブラウザからの更新は関数に通し、元の投稿者や日時を書き換えられないようにする。
revoke update on table public.pin_comments from public, anon, authenticated;
revoke update (id, pin_id, user_id, content, creator_username, created_at)
  on table public.pin_comments from public, anon, authenticated;

-- 3. 未ログインでの実行を拒否し、Supabase の API に関数を読み込ませる。
revoke all on function public.edit_pin_comment(text, text, text) from public, anon, authenticated;
grant execute on function public.edit_pin_comment(text, text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
