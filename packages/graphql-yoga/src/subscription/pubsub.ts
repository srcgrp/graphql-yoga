import { Repeater } from '@repeaterjs/repeater'

type PubSubPublishArgsByKey = {
  [key: string]: [] | [any] | [number | string, any]
}

type EventAPI = {
  Event: typeof Event
  EventTarget: typeof EventTarget
}

type ChannelPubSubConfig = {
  /**
   * The event target. If not specified an (in-memory) EventTarget will be created.
   * For multiple server replica or serverless environments a distributed EventTarget is recommended.
   *
   * An event dispatched on the event target MUST have a `data` property.
   */
  eventTarget?: EventTarget
  /**
   * Event and EventTarget implementation.
   * Providing this is mandatory for a Node.js versions below 16.
   */
  event?: EventAPI
}

const resolveGlobalConfig = (api: EventAPI = globalThis): EventAPI => {
  if (!api.Event || !api.EventTarget) {
    throw new Error(`
[graphql-yoga] 'createPubSub' uses the Event and EventTarget APIs.

In modern JavaScript environments those are part of the global scope. However, if you are using an older version of Node.js (<= 16.x.x), those APIs must be polyfilled.
You can provide polyfills to the 'createPubSub' function:

\`\`\`
// yarn install @ungap/event @ungap/event-target
import Event from '@ungap/event'
import EventTarget from '@ungap/event-target'

const pubSub = createPubSub({
  event: {
    Event,
    EventTarget,
  }
})
\`\`\`
`)
  }

  return globalThis
}

export type PubSubEvent<
  TPubSubPublishArgsByKey extends PubSubPublishArgsByKey,
  TKey extends Extract<keyof TPubSubPublishArgsByKey, string>,
> = Event & {
  data?: TPubSubPublishArgsByKey[TKey][1] extends undefined
    ? TPubSubPublishArgsByKey[TKey][0]
    : TPubSubPublishArgsByKey[TKey][1]
}

/**
 * Utility for publishing and subscribing to events.
 */
export const createPubSub = <
  TPubSubPublishArgsByKey extends PubSubPublishArgsByKey,
>(
  config?: ChannelPubSubConfig,
) => {
  const { Event, EventTarget } = resolveGlobalConfig(config?.event)

  const target = config?.eventTarget ?? new EventTarget()

  return {
    publish<TKey extends Extract<keyof TPubSubPublishArgsByKey, string>>(
      routingKey: TKey,
      ...args: TPubSubPublishArgsByKey[TKey]
    ) {
      const event: PubSubEvent<TPubSubPublishArgsByKey, TKey> = new Event(
        routingKey,
      )
      event.data = args[0]
      target.dispatchEvent(event)
    },
    subscribe<TKey extends Extract<keyof TPubSubPublishArgsByKey, string>>(
      ...[routingKey, id]: TPubSubPublishArgsByKey[TKey][1] extends undefined
        ? [TKey]
        : [TKey, TPubSubPublishArgsByKey[TKey][0]]
    ): Repeater<
      TPubSubPublishArgsByKey[TKey][1] extends undefined
        ? TPubSubPublishArgsByKey[TKey][0]
        : TPubSubPublishArgsByKey[TKey][1]
    > {
      const topic =
        id === undefined ? routingKey : `${routingKey}:${id as number}`

      return new Repeater(function subscriptionRepeater(next, stop) {
        stop.then(function subscriptionRepeaterStopHandler() {
          target.removeEventListener(topic, pubsubEventListener)
        })

        target.addEventListener(topic, pubsubEventListener)

        function pubsubEventListener(
          event: PubSubEvent<TPubSubPublishArgsByKey, TKey>,
        ) {
          next(event.data)
        }
      })
    },
  }
}