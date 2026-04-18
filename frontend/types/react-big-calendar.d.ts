declare module 'react-big-calendar' {
  import * as React from 'react'

  export type View = 'month' | 'week' | 'day' | 'agenda' | 'work_week'

  export interface CalendarProps<TEvent = object> {
    localizer: DateLocalizer
    events?: TEvent[]
    startAccessor?: string | ((event: TEvent) => Date)
    endAccessor?: string | ((event: TEvent) => Date)
    allDayAccessor?: string | ((event: TEvent) => boolean)
    titleAccessor?: string | ((event: TEvent) => string)
    eventPropGetter?: (event: TEvent) => { style?: React.CSSProperties }
    onSelectEvent?: (event: TEvent) => void
    views?: View[]
    defaultView?: View
    popup?: boolean
    children?: React.ReactNode
  }

  export class Calendar<TEvent = object> extends React.Component<CalendarProps<TEvent>> {}

  export interface DateLocalizer {
    format: (value: Date, format: string) => string
  }

  export function dateFnsLocalizer(args: {
    format: (date: Date, formatStr: string, options?: object) => string
    parse: (dateString: string, formatStr: string, referenceDate: Date, options?: object) => Date
    startOfWeek: (date: Date) => Date
    getDay: (date: Date) => number
    locales: Record<string, object>
  }): DateLocalizer
}

declare module 'react-big-calendar/lib/css/react-big-calendar.css' {
  const content: string
  export default content
}
