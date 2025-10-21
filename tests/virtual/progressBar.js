// @flow
import { memoryEditInterface, PROGRESS_BAR_ID, debug, stop_summarization } from './index.js';

// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function progress_bar(id /*: string */, progress /*: ?number */, total /*: ?number */, title /*: ?string */) /*: void */ {
    // Display, update, or remove a progress bar
    id = `${PROGRESS_BAR_ID}_${id}`
    // $FlowFixMe[cannot-resolve-name]
    const $existing = $(`.${id}`);
    if ($existing.length > 0) {  // update the progress bar
        if (title) $existing.find('div.title').text(title);
        if (progress) {
            $existing.find('span.progress').text(progress)
            $existing.find('progress').val(progress)
        }
        if (total) {
            $existing.find('span.total').text(total)
            $existing.find('progress').attr('max', total)
        }
        return;
    }

    // create the progress bar (use defaults for nullable parameters)
    // $FlowFixMe[cannot-resolve-name]
    const bar = $(`
<div class="${id} auto_summarize_progress_bar flex-container justifyspacebetween alignitemscenter">
    <div class="title">${title ?? ''}</div>
    <div>(<span class="progress">${progress ?? 0}</span> / <span class="total">${total ?? 0}</span>)</div>
    <progress value="${progress ?? 0}" max="${total ?? 0}" class="flex1"></progress>
    <button class="menu_button fa-solid fa-stop" title="Abort summarization"></button>
</div>`)

    // add a click event to abort the summarization
    bar.find('button').on('click', function () {
        stop_summarization();
    })

    // append to the main chat area (#sheld)
    // $FlowFixMe[cannot-resolve-name]
    $('#sheld').append(bar);

    // append to the edit interface if it's open
    if (memoryEditInterface?.is_open()) {
        memoryEditInterface.$progress_bar.append(bar)
    }
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function remove_progress_bar(id /*: string */) /*: void */ {
    id = `${PROGRESS_BAR_ID}_${id}`
    // $FlowFixMe[cannot-resolve-name]
    const $existing = $(`.${id}`);
    if ($existing.length > 0) {  // found
        debug("Removing progress bar")
        $existing.remove();
    }
}

export { progress_bar, remove_progress_bar };