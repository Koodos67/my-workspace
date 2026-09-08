import { MessageSquare, Trash2 } from 'lucide-react';
import { ActionForm } from './action-form';
import { CommentComposer } from './comment-composer';
import { commentDate, commentInitials, type Comment } from '@/lib/comments';
import { deleteComment, editComment, postComment } from '@/app/items/comment-actions';

/**
 * A conversation on one deliverable, not a log. KOODOS and the client are told apart by side,
 * tint and a role label, so a client scanning a thread can see at a glance who said what.
 */
export function CommentThread({ itemId, comments, viewerId, isAdmin, canComment, reason }: {
  itemId: string; comments: Comment[]; viewerId: string; isAdmin: boolean;
  canComment: boolean; reason: string;
}) {
  const live = comments.filter(comment => !comment.deleted_at);
  return <section id="comments" className="comment-thread form-panel" aria-labelledby="comments-title">
    <div className="section-top">
      <h2 id="comments-title"><MessageSquare size={18} strokeWidth={1.75} aria-hidden="true" /> Comments</h2>
      <span className="muted">{live.length === 0 ? 'None yet' : `${live.length} comment${live.length === 1 ? '' : 's'}`}</span>
    </div>

    {!comments.length && <p className="comment-empty muted">
      {canComment
        ? isAdmin
          ? 'Nothing here yet. Anything you write is visible to this client.'
          : 'Nothing here yet. Ask a question or leave a thought about this deliverable — KOODOS will see it.'
        : 'No comments.'}
    </p>}

    {comments.length > 0 && <ol className="comment-list">
      {comments.map(comment => {
        const mine = comment.profile_id === viewerId;
        const removed = !!comment.deleted_at;
        return <li key={comment.id} className="comment" data-role={comment.author_role} data-mine={mine || undefined} data-removed={removed || undefined}>
          <span className="comment-avatar" aria-hidden="true">{commentInitials(comment.author_name)}</span>
          <div className="comment-body">
            <p className="comment-meta">
              <strong>{mine ? 'You' : comment.author_name}</strong>
              <span className="comment-role">{comment.author_role === 'admin' ? 'KOODOS' : 'Client'}</span>
              <time dateTime={comment.created_at}>{commentDate(comment.created_at)}</time>
              {comment.edited_at && <span className="comment-edited">edited</span>}
            </p>
            {removed
              ? <p className="comment-removed">Removed {commentDate(comment.deleted_at!)}. Kept on the record and shown to KOODOS only.</p>
              : <p className="comment-text">{comment.body}</p>}
            {!removed && canComment && (mine || isAdmin) && <div className="comment-actions">
              {mine && <details className="comment-edit">
                <summary>Edit</summary>
                <ActionForm className="comment-edit-form" action={editComment.bind(null, comment.id)} success="Comment updated.">
                  <label htmlFor={'edit-' + comment.id}>Edit your comment</label>
                  <textarea id={'edit-' + comment.id} name="body" defaultValue={comment.body} required maxLength={10000} rows={3} />
                  <button className="button compact">Save comment</button>
                </ActionForm>
              </details>}
              <ActionForm className="inline-form" action={deleteComment.bind(null, comment.id)}
                confirm={mine ? 'Remove your comment? KOODOS keeps it on the record.' : 'Remove this comment from the client view?'}>
                <button className="icon-button danger"><Trash2 size={14} aria-hidden="true" /> Remove</button>
              </ActionForm>
            </div>}
          </div>
        </li>;
      })}
    </ol>}

    {canComment
      ? <CommentComposer action={postComment.bind(null, itemId)}
          label={comments.length ? 'Add to the conversation' : 'Start the conversation'}
          placeholder={isAdmin ? 'Reply to your client, or add context to this deliverable.' : 'Ask a question, or tell us what you think.'}
          submit="Post comment" />
      : <p className="comment-closed muted">{reason}</p>}
  </section>;
}
