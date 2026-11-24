import type { TKey } from './i18n'

export const TEMPLATE_IDS = ['blank', 'brainstorm', 'kanban', 'meeting', 'weekly'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

type Draft = Record<string, unknown>

const note = (text: string, extra: Draft = {}): Draft => ({ type: 'text', text, ...extra })
const list = (title: string, extra: Draft = {}): Draft => ({ type: 'checklist', title, tasks: [], ...extra })

// Starting items for a new board. Text is written in the user's current language.
export function templateItems(id: TemplateId, t: (key: TKey) => string): Draft[] {
  switch (id) {
    case 'blank':
      return []
    case 'brainstorm':
      return [
        note(t('bs_goal'), { color: 'yellow', span: 2, fontSize: 'l' }),
        list(t('bs_ideas'), { color: 'blue' }),
        list(t('bs_next'), { color: 'green' }),
      ]
    case 'kanban':
      return [
        list(t('kb_todo'), { color: 'blue' }),
        list(t('kb_doing'), { color: 'orange' }),
        list(t('kb_done'), { color: 'green' }),
      ]
    case 'meeting':
      return [
        note(t('mt_info'), { color: 'yellow' }),
        list(t('mt_agenda'), { color: 'blue' }),
        note(t('mt_notes'), { span: 2 }),
        list(t('mt_actions'), { color: 'green' }),
      ]
    case 'weekly':
      return [
        {
          type: 'table',
          cols: 2,
          header: true,
          span: 2,
          cells: [
            t('wk_day'), t('wk_plan'),
            t('wk_mon'), '',
            t('wk_tue'), '',
            t('wk_wed'), '',
            t('wk_thu'), '',
            t('wk_fri'), '',
          ],
        },
        list(t('wk_priorities'), { color: 'orange' }),
      ]
  }
}
