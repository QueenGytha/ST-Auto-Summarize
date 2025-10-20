import {
    get_data,
    get_memory,
    edit_memory,
    clear_memory,
    remember_message_toggle,
    forget_message_toggle,
    getContext,
    get_settings,
    set_settings,
    debug,
    log,
    refresh_memory,
    summarize_messages,
    display_injection_preview,
    concatenate_summaries,
    copyText,
    getRegexScripts,
    runRegexScript,
    remember_button_class,
    summarize_button_class,
    forget_button_class,
    css_message_div,
    get_summary_style_class,
    chat_metadata
} from './index.js';


class MemoryEditInterface {
    filtered = []
    displayed = []
    selected = new Set()

    filter_bar = {
        "short_term": {
            "title": "Summaries currently in short-term memory",
            "display": "Short-Term",
            "check": (msg) => get_data(msg, 'include') === "short",
            "default": true,
            "count": 0
        },
        "long_term": {
            "title": "Summaries marked for long-term memory, even if they are currently in short-term memory or out of context",
            "display": "Long-Term",
            "check": (msg) => get_data(msg, 'remember'),
            "default": true,
            "count": 0
        },
        "excluded": {
            "title": "Summaries not in short-term or long-term memory",
            "display": "Forgot",
            "check": (msg) => !get_data(msg, 'include') && get_data(msg, 'memory'),
            "default": false,
            "count": 0
        },
        "force_excluded": {
            "title": "Summaries that have been manually excluded from memory",
            "display": "Excluded",
            "check":  (msg) => get_data(msg, 'exclude'),
            "default": false,
            "count": 0
        },
        "edited": {
            "title": "Summaries that have been manually edited",
            "display": "Edited",
            "check": (msg) => get_data(msg, 'edited'),
            "default": false,
            "count": 0
        },
        "user": {
            "title": "User messages with or without summaries",
            "display": "User",
            "check":  (msg) => msg.is_user,
            "default": false,
            "count": 0
        },
        "no_summary": {
            "title": "Messages without a summary",
            "display": "No Summary",
            "check": (msg) => !get_data(msg, 'memory'),
            "default": false,
            "count": 0
        },
        "errors": {
            "title": "Summaries that failed during generation",
            "display": "Errors",
            "check": (msg) => get_data(msg, 'error'),
            "default": false,
            "count": 0
        },
    }

    html_template = `
<div id="auto_summarize_memory_state_interface">
<div class="flex-container justifyspacebetween alignitemscenter">
    <h4>Memory State</h4>
    <button id="preview_memory_state" class="menu_button fa-solid fa-eye margin0" title="Preview current memory state (the exact text that will be injected into your context)."></button>
    <button id="expand_filter_bar" class="menu_button fa-solid fa-list-check margin0" title="Toggle chat filters"></button>
    <label class="checkbox_label" title="Selecting message subsets applies to the entire chat history. When unchecked, it only applies to the current page.">
        <input id="global_selection" type="checkbox" />
        <span>Global Selection</span>
    </label>
    <label class="checkbox_label" title="Reverse the sort order of each page.">
        <input id="reverse_page_sort" type="checkbox" />
        <span>Reverse page sort</span>
    </label>
</div>

<div id="filter_bar" class="flex-container justifyspacebetween alignitemscenter"></div>

<hr>
<div id="progress_bar"></div>
<div id="pagination" style="margin: 0.5em 0"></div>

<table cellspacing="0">
<thead>
    <tr>
        <th class="mass_select" title="Select all/none"><input id="mass_select" type="checkbox"/></th>
        <th title="Message ID associated with the memory"><i class="fa-solid fa-hashtag"></i></th>
        <th title="Sender"><i class="fa-solid fa-comment"></i></th>
        <th title="Memory text">Memory</th>
        <th class="actions">Actions</th>
    </tr>
</thead>
<tbody></tbody>
</table>

<hr>
<div>Bulk Actions (Selected: <span id="selected_count"></span>)</div>
<div id="bulk_actions" class="flex-container justifyspacebetween alignitemscenter">
    <button id="bulk_remember"   class="menu_button flex1" title="Toggle inclusion of selected summaries in long-term memory"> <i class="fa-solid fa-brain"></i>Remember</button>
    <button id="bulk_exclude"    class="menu_button flex1" title="Toggle inclusion of selected summaries from all memory">     <i class="fa-solid fa-ban"></i>Exclude</button>
    <button id="bulk_copy"       class="menu_button flex1" title="Copy selected memories to clipboard">                        <i class="fa-solid fa-copy"></i>Copy</button>
    <button id="bulk_summarize"  class="menu_button flex1" title="Re-Summarize selected memories">                             <i class="fa-solid fa-quote-left"></i>Summarize</button>
    <button id="bulk_delete"     class="menu_button flex1" title="Delete selected memories">                                   <i class="fa-solid fa-trash"></i>Delete</button>
    <button id="bulk_regex"      class="menu_button flex1" title="Run the selected regex script on selected memories">         <i class="fa-solid fa-shuffle"></i>Regex Replace</button>
    <select id="regex_selector"  title="Choose regex script"></select>
</div>
</div>
`
    html_button_template = `
    <div class="interface_actions">
        <div title="Remember (toggle inclusion of summary in long-term memory)"     class="mes_button fa-solid fa-brain ${remember_button_class}"></div>
        <div title="Force Exclude (toggle inclusion of summary from all memory)"    class="mes_button fa-solid fa-ban ${forget_button_class}"></div>
        <div title="Re-Summarize (AI)"                                              class="mes_button fa-solid fa-quote-left ${summarize_button_class}"></div>
    </div>
    `
    ctx = getContext();

    constructor() {
        this.settings = get_settings('memory_edit_interface_settings')
    }
    init() {
        this.popup = new this.ctx.Popup(this.html_template, this.ctx.POPUP_TYPE.TEXT, undefined, {wider: true});
        this.$content = $(this.popup.content)
        this.$table = this.$content.find('table')
        this.$table_body = this.$table.find('tbody')
        this.$pagination = this.$content.find('#pagination')
        this.$counter = this.$content.find("#selected_count")
        this.$progress_bar = this.$content.find("#progress_bar")
        this.$bulk_actions = this.$content.find("#bulk_actions button, #bulk_actions select")

        this.$global_selection_checkbox = this.$content.find("#global_selection")
        this.$global_selection_checkbox.prop('checked', this.settings.global_selection ?? false)
        this.$global_selection_checkbox.on('change', () => this.save_settings())

        this.$filter_bar = this.$content.find('#filter_bar')
        this.$expand_filter_bar = this.$content.find("#expand_filter_bar")
        this.$expand_filter_bar.on('click', () => this.$filter_bar.toggle())

        this.$reverse_page_sort = this.$content.find('#reverse_page_sort')
        this.$reverse_page_sort.prop('checked', this.settings.reverse_page_sort ?? false)
        this.$reverse_page_sort.on('change', () => {
            this.save_settings()
            this.update_filters(true)
            this.update_table()
        })

        this.$mass_select_checkbox = this.$content.find('#mass_select')
        this.$mass_select_checkbox.on('change', () => {
            const checked = this.$mass_select_checkbox.is(':checked')
            const indexes = this.global_selection() ? this.filtered : this.displayed
            this.toggle_selected(indexes, checked)
        })

        this.update_regex_section()

        this.update_filter_counts()
        for (const [id, data] of Object.entries(this.filter_bar)) {
            const select_button_id = `select_${id}`
            const filter_checkbox_id = `filter_${id}`
            const checked = this.settings[id] ?? data.default

            const $el = $(`
<div class="filter_box flex1">
    <label class="checkbox_label" title="${data.title}">
        <input id="${filter_checkbox_id}" type="checkbox" ${checked ? "checked" : ""}/>
        <span>${data.display}</span>
        <span>(${data.count})</span>
    </label>
    <button id="${select_button_id}" class="menu_button flex1" title="Mass select">Select</button>
</div>
            `)

            this.$content.find('#filter_bar').append($el)

            const $select = $el.find("#"+select_button_id)
            const $filter = $el.find("#"+filter_checkbox_id)

            data.filtered = () => $filter.is(':checked')

            $filter.on('change', () => {
                this.update_filters()
                this.save_settings();
            })

            $select.on('click', () => {
                const all_indexes = this.global_selection() ? this.filtered : this.displayed
                const select = []
                for (const i of all_indexes) {
                    const message = this.ctx.chat[i];
                    if (data.check(message)) {
                        select.push(i);
                    }
                }
                this.toggle_selected(select);
            })
        }

        this.$content.closest('dialog').css('min-width', '80%')

        this.$content.find(`#bulk_remember`).on('click', () => {
            remember_message_toggle(Array.from(this.selected))
            this.update_table()
        })
        this.$content.find(`#bulk_exclude`).on('click', () => {
            forget_message_toggle(Array.from(this.selected))
            this.update_table()
        })
        this.$content.find(`#bulk_summarize`).on('click', async () => {
            const indexes = Array.from(this.selected).sort()
            await summarize_messages(indexes);
            this.update_table()
        })
        this.$content.find(`#bulk_delete`).on('click', () => {
            this.selected.forEach(id => {
                debug("DELETING: " + id)
                clear_memory(this.ctx.chat[id])
            })
            this.update_table()
        })
        this.$content.find('#bulk_copy').on('click', () => {
            this.copy_to_clipboard()
        })
        this.$content.find('#preview_memory_state').on('click', () => display_injection_preview())

        const self = this;
        this.$content.on('change', 'tr textarea', function () {
            const new_memory = $(this).val();
            const message_id = Number($(this).closest('tr').attr('message_id'));
            const message = self.ctx.chat[message_id]
            edit_memory(message, new_memory)
            self.update_table()
        }).on("input", 'tr textarea', function () {
            this.style.height = "auto";
            this.style.height = this.scrollHeight + "px";
        });
        this.$content.on('click', 'input.interface_message_select', function () {
            const index = Number(this.value);
            self.toggle_selected([index])
        })
        this.$content.on("click", `tr .${remember_button_class}`, function () {
            const message_id = Number($(this).closest('tr').attr('message_id'));
            remember_message_toggle(message_id);
            self.update_table()
        });
        this.$content.on("click", `tr .${forget_button_class}`, function () {
            const message_id = Number($(this).closest('tr').attr('message_id'));
            forget_message_toggle(message_id);
            self.update_table()
        })
        this.$content.on("click", `tr .${summarize_button_class}`, async function () {
            const message_id = Number($(this).closest('tr').attr('message_id'));
            await summarize_messages(message_id);
        });
    }

    async show() {
        this.init()
        this.update_filters()
        this.selected.clear()
        this.update_selected()
        const result = this.popup.show();
        this.update_table()
        this.$content.find('tr textarea').each(function () {
            this.style.height = 'auto'
            this.style.height = this.scrollHeight + "px";
        })
        if (this.settings.reverse_page_sort) {
            this.scroll_to_bottom()
        }
        await result
    }

    is_open() {
        if (!this.popup) return false
        return this.$content.closest('dialog').attr('open');
    }
    global_selection() {
        return this.$global_selection_checkbox.is(':checked');
    }

    clear() {
        const $rows = this.$table_body.find('tr')
        for (const row of $rows) {
            row.remove()
        }
    }
    update_table() {
        if (!this.is_open()) return
        refresh_memory()
        debug("Updating memory interface...")
        let $row;
        let $previous_row;
        for (const i of this.displayed) {
            $row = this.update_message_visuals(i, $previous_row)
            $previous_row = $row
        }
        this.update_selected()
        this.update_context_line()
    }
    update_filters(preserve_page=false) {
        log("Updating interface filters...")
        const filter_no_summary = this.filter_bar.no_summary.filtered()
        const filter_short_term = this.filter_bar.short_term.filtered()
        const filter_long_term = this.filter_bar.long_term.filtered()
        const filter_excluded = this.filter_bar.excluded.filtered()
        const filter_force_excluded = this.filter_bar.force_excluded.filtered()
        const filter_edited = this.filter_bar.edited.filtered()
        const filter_errors = this.filter_bar.errors.filtered()
        const filter_user = this.filter_bar.user.filtered()
        this.filtered = []
        for (let i = this.ctx.chat.length-1; i >= 0; i--) {
            const msg = this.ctx.chat[i]
            const include = (
                (filter_short_term && this.filter_bar.short_term.check(msg)) ||
                (filter_long_term && this.filter_bar.long_term.check(msg)) ||
                (filter_no_summary && this.filter_bar.no_summary.check(msg)) ||
                (filter_errors && this.filter_bar.errors.check(msg)) ||
                (filter_excluded && this.filter_bar.excluded.check(msg)) ||
                (filter_edited && this.filter_bar.edited.check(msg)) ||
                (filter_force_excluded && this.filter_bar.force_excluded.check(msg)) ||
                (filter_user && this.filter_bar.user.check(msg))
            );
            if (include) {
                this.filtered.push(i)
            } else {
                this.selected.delete(i)
            }
        }
        this.$pagination.pagination({
            dataSource: this.filtered,
            pageSize: 100,
            pageNumber: preserve_page ? this.pagination?.pageNumber : 1,
            sizeChangerOptions: [10, 50, 100, 500, 1000],
            showSizeChanger: true,
            callback: (data, pagination) => {
                this.pagination = pagination
                if (this.settings.reverse_page_sort) {
                    data.reverse()
                }
                this.displayed = data
                this.clear()
                this.update_table()
            }
        })
        if (this.settings.reverse_page_sort) {
            this.scroll_to_bottom()
        }
    }
    update_selected() {
        const $checkboxes = this.$table_body.find(`input.interface_message_select`)
        for (const checkbox of $checkboxes) {
            if ('value' in checkbox) {
                $(checkbox).prop('checked', this.selected.has(Number(checkbox.value)));
            }
        }
        this.$counter.text(this.selected.size)
        if (this.selected.size > 0) {
            this.$counter.css('color', 'red')
            this.$mass_select_checkbox.prop('checked', true)
            this.$bulk_actions.removeAttr('disabled');
        } else {
            this.$counter.css('color', 'unset')
            this.$mass_select_checkbox.prop('checked', false)
            this.$bulk_actions.prop('disabled', false);
        }
    }
    update_filter_counts() {
        for (const data of Object.values(this.filter_bar)) {
            data.count = 0
        }
        for (const msg of this.ctx.chat) {
            for (const data of Object.values(this.filter_bar)) {
                if (data.check(msg)) data.count++
            }
        }
    }
    update_regex_section() {
        this.$regex_selector = this.$content.find('#regex_selector')
        this.$replace_button = this.$content.find('#bulk_regex')
        const script_list = getRegexScripts()
        const scripts = {}
        Object.keys(script_list).forEach(function(i) {
            const script = script_list[i]
            scripts[script.scriptName] = script
        });
        this.$regex_selector.empty();
        this.$regex_selector.append(`<option value="">Select Script</option>`)
        for (const name of Object.keys(scripts)) {
            this.$regex_selector.append(`<option value="${name}">${name}</option>`)
        }
        this.$regex_selector.val(this.settings.regex_script || "")
        this.$regex_selector.on('change', () => {
            this.settings.regex_script = this.$regex_selector.val()
            this.save_settings()
        })
        this.$replace_button.on('click', () => {
            const script_name = this.$regex_selector.val()
            const script = scripts[script_name]
            log(`Running regex script \"${script_name}\" on selected memories`)
            for (const i of this.selected) {
                const message = this.ctx.chat[i]
                const memory = get_memory(message)
                const new_text = runRegexScript(script, memory)
                edit_memory(message, new_text)
            }
            this.update_table()
        })
    }
    update_context_line() {
        const target_id = chat_metadata["lastInContextMessageId"]
        const to_check = this.settings.reverse_page_sort ? this.displayed.slice().reverse() : this.displayed
        const start = to_check[0]
        const end = to_check[to_check.length-1]
        let closest_id;
        let style;
        if (target_id > start) {
            closest_id = start;
            style = this.settings.reverse_page_sort ? 'last_in_context_bottom' : 'last_in_context_top'
        } else if (target_id < end) {
            closest_id = end;
            style = this.settings.reverse_page_sort ? 'last_in_context_top' : 'last_in_context_bottom'
        } else {
            closest_id = start;
            for (const id of to_check) {
                if (id >= target_id) closest_id = id
                else break;
            }
            style = this.settings.reverse_page_sort ? 'last_in_context_top' : 'last_in_context_bottom'
        }
        this.$table_body.find('tr').removeClass('last_in_context_top last_in_context_bottom')
        this.$table_body.find(`tr#memory_${closest_id}`).addClass(style)
    }
    toggle_selected(indexes, value=null) {
        if (value === null) {
            const all_selected = indexes.every(i => this.selected.has(i));
            if (all_selected) {
                for (const i of indexes) {
                    this.selected.delete(i);
                }
            } else {
                for (const i of indexes) {
                    this.selected.add(i);
                }
            }
        } else if (value === true) {
            for (const i of indexes) {
                this.selected.add(i)
            }
        } else if (value === false) {
            for (const i of indexes) {
                this.selected.delete(i)
            }
        }
        this.update_selected()
    }
    update_message_visuals(i, $previous_row=null, style=true, text=null) {
        if (!this.is_open()) return
        const msg = this.ctx.chat[i];
        const memory = text ?? get_memory(msg)
        const error = get_data(msg, 'error') || ""
        const edited = get_data(msg, 'edited')
        const row_id = `memory_${i}`
        let $row = this.$table_body.find(`tr#${row_id}`);
        let $memory;
        let $select_checkbox;
        let $buttons;
        let $sender;
        if ($row.length === 0) {
            $memory = $(`<textarea rows="1">${memory}</textarea>`)
            $select_checkbox = $(`<input class="interface_message_select" type="checkbox" value="${i}">`)
            $buttons = $(this.html_button_template)
            if (msg.is_user) {
                $sender = $(`<i class="fa-solid fa-user" title="User message"></i>`)
            } else {
                $sender = $(`<i class="fa-solid" title="Character message"></i>`)
            }
            $row = $(`<tr message_id="${i}" id="${row_id}"></tr>`)
            if ($previous_row) {
                $row.insertAfter($previous_row)
            } else {
                $row.prependTo(this.$table_body)
            }
            $select_checkbox.wrap('<td></td>').parent().appendTo($row)
            $(`<td>${i}</td>`).appendTo($row)
            $sender.wrap('<td></td>').parent().appendTo($row)
            $memory.wrap(`<td class="interface_summary"></td>`).parent().appendTo($row)
            $buttons.wrap(`<td></td>`).parent().appendTo($row)
        } else {
            $memory = $row.find('textarea')
            if ($memory.val() !== memory) {
                $memory.val(memory)
            }
        }
        if (!memory) {
            $memory.attr('placeholder', `${error}`);
        } else {
            $memory[0].style.height = "auto";
            $memory[0].style.height = $memory[0].scrollHeight + "px";
        }
        $memory.parent().find('i').remove()
        if (edited) {
            $memory.parent().append($('<i class="fa-solid fa-pencil" title="manually edited"></i>'))
        }
        $memory.removeClass().addClass(css_message_div)
        if (style) {
            $memory.addClass(get_summary_style_class(msg))
        }
        return $row
    }
    scroll_to_bottom() {
        this.$table.scrollTop(this.$table[0].scrollHeight);
    }
    copy_to_clipboard() {
        const text = concatenate_summaries(Array.from(this.selected));
        copyText(text)
        toastr.info("All memories copied to clipboard.")
    }
    save_settings() {
        this.settings.global_selection = this.$global_selection_checkbox.is(':checked')
        this.settings.reverse_page_sort = this.$reverse_page_sort.is(':checked')
        for (const [id, data] of Object.entries(this.filter_bar)) {
            this.settings[id] = data.filtered()
        }
        set_settings('memory_edit_interface_settings', this.settings)
    }
}

export { MemoryEditInterface };