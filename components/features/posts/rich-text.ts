/**
 * ブログ本文（Tiptap）の見た目。エディタ（編集中）と PostBody（表示）で同じ定義を使い、
 * 「書いたものと出るもの」がズレないようにする。
 * Tailwind の preflight が見出し・リストの既定スタイルを消すため、子孫セレクタで当て直す
 */
export const RICH_TEXT_CLASS = [
  '[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:font-bold',
  '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-bold',
  '[&_p]:my-2 [&_a]:text-link [&_a]:underline',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-border-default [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
  '[&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-md',
  '[&_hr]:my-6 [&_hr]:border-border-default',
  '[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-1 [&_code]:text-sm',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm',
].join(' ')
