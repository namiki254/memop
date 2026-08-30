/**
 * ログインユーザーのGitHubユーザー名を取り出す．
 *
 * メールアドレスでログインしただけの人は GitHub の識別情報を持たないため，
 * その場合は null を返す．呼び出し側で「本人の画面にだけメールを見せる」のは
 * 良いが，他人にも見える場所（ピンの作成者表示など）に安易に流用すると
 * 生のメールアドレスを他人に晒すことになるため，あえてここでは
 * メールへのフォールバックをしない．
 */
export function getGithubUsername(user) {
  if (!user) return null;

  const metadata = user.user_metadata ?? {};

  const githubIdentity = user.identities?.find(
    (identity) => identity.provider === "github",
  );
  const identityData = githubIdentity?.identity_data ?? {};

  return (
    metadata.user_name ??
    metadata.preferred_username ??
    identityData.user_name ??
    identityData.preferred_username ??
    metadata.name ??
    identityData.name ??
    null
  );
}
