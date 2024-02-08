import {
  FrameActionBody,
  Message,
  NobleEd25519Signer,
  makeFrameAction,
} from '@farcaster/core'
import * as ed from '@noble/ed25519'
import { Window } from 'happy-dom'
import { type Context, Hono } from 'hono'
import { ImageResponse } from 'hono-og'
import { type JSXNode } from 'hono/jsx'
import { jsxRenderer } from 'hono/jsx-renderer'
import { bytesToHex } from 'viem/utils'

import {
  type Frame,
  type FrameButton,
  type FrameMetaTagPropertyName,
  type FrameVersion,
} from './types.js'

type FrameContext = Context & {
  trustedData?: { messageBytes: string }
  untrustedData?: {
    fid: number
    url: string
    messageHash: string
    timestamp: number
    network: number
    buttonIndex?: 1 | 2 | 3 | 4
    castId: { fid: number; hash: string }
    inputText?: string
  }
}

type FrameReturnType = {
  image: JSX.Element
  intents: JSX.Element
}

const renderer = jsxRenderer(
  ({ children }) => {
    return (
      <html lang="en">
        <head>
          <title>𝑭𝒓𝒂𝒎𝒆work Preview</title>
          <style>{getGlobalStyles()}</style>
        </head>
        <body style={{ padding: '1rem' }}>{children}</body>
      </html>
    )
  },
  { docType: true },
)

export class Framework extends Hono {
  frame(
    path: string,
    handler: (c: FrameContext) => FrameReturnType | Promise<FrameReturnType>,
  ) {
    this.get('/preview', renderer)
    this.post('/preview', renderer)

    this.get('/preview/*', async (c) => {
      const baseUrl = c.req.url.replace('/preview', '')
      const response = await fetch(baseUrl)
      const text = await response.text()
      const frame = htmlToFrame(text)
      return c.render(
        <>
          <FramePreview baseUrl={baseUrl} frame={frame} />
        </>,
      )
    })

    this.post('/preview', async (c) => {
      const baseUrl = c.req.url.replace('/preview', '')

      const formData = await c.req.formData()
      const buttonIndex = parseInt(
        typeof formData.get('buttonIndex') === 'string'
          ? (formData.get('buttonIndex') as string)
          : '',
      )
      const inputText = formData.get('inputText')
        ? Buffer.from(formData.get('inputText') as string)
        : undefined

      const privateKeyBytes = ed.utils.randomPrivateKey()
      // const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes)

      // const key = bytesToHex(publicKeyBytes)
      // const deadline = Math.floor(Date.now() / 1000) + 60 * 60 // now + hour
      //
      // const account = privateKeyToAccount(bytesToHex(privateKeyBytes))
      // const requestFid = 1

      // const signature = await account.signTypedData({
      //   domain: {
      //     name: 'Farcaster SignedKeyRequestValidator',
      //     version: '1',
      //     chainId: 10,
      //     verifyingContract: '0x00000000FC700472606ED4fA22623Acf62c60553',
      //   },
      //   types: {
      //     SignedKeyRequest: [
      //       { name: 'requestFid', type: 'uint256' },
      //       { name: 'key', type: 'bytes' },
      //       { name: 'deadline', type: 'uint256' },
      //     ],
      //   },
      //   primaryType: 'SignedKeyRequest',
      //   message: {
      //     requestFid: BigInt(requestFid),
      //     key,
      //     deadline: BigInt(deadline),
      //   },
      // })

      // const response = await fetch(
      //   'https://api.warpcast.com/v2/signed-key-requests',
      //   {
      //     method: 'POST',
      //     headers: {
      //       'Content-Type': 'application/json',
      //     },
      //     body: JSON.stringify({
      //       deadline,
      //       key,
      //       requestFid,
      //       signature,
      //     }),
      //   },
      // )

      const fid = 2
      const castId = {
        fid,
        hash: new Uint8Array(
          Buffer.from('0000000000000000000000000000000000000000', 'hex'),
        ),
      }
      const frameActionBody = FrameActionBody.create({
        url: Buffer.from(baseUrl),
        buttonIndex,
        castId,
        inputText,
      })
      const frameActionMessage = await makeFrameAction(
        frameActionBody,
        { fid, network: 1 },
        new NobleEd25519Signer(privateKeyBytes),
      )

      const message = frameActionMessage._unsafeUnwrap()
      const response = await fetch(baseUrl, {
        method: 'POST',
        body: JSON.stringify({
          untrustedData: {
            buttonIndex,
            castId: {
              fid: castId.fid,
              hash: bytesToHex(castId.hash),
            },
            fid,
            inputText,
            messageHash: bytesToHex(message.hash),
            network: 1,
            timestamp: message.data.timestamp,
            url: baseUrl,
          },
          trustedData: {
            messageBytes: Buffer.from(
              Message.encode(message).finish(),
            ).toString('hex'),
          },
        }),
      })
      const text = await response.text()
      // TODO: handle redirects
      const frame = htmlToFrame(text)

      return c.render(
        <>
          <FramePreview baseUrl={baseUrl} frame={frame} />
        </>,
      )
    })

    this.get(path, async (c) => {
      const { intents } = await handler(c)
      return c.render(
        <html lang="en">
          <head>
            <meta property="fc:frame" content="vNext" />
            <meta property="fc:frame:image" content={`${c.req.url}_og`} />
            <meta property="og:image" content={`${c.req.url}_og`} />
            <meta property="fc:frame:post_url" content={c.req.url} />
            {parseIntents(intents)}
          </head>
        </html>,
      )
    })

    // TODO: don't slice
    this.get(`${path.slice(1)}_og`, async (c) => {
      const { image } = await handler(c)
      return new ImageResponse(image)
    })

    this.post(path, async (c) => {
      const context = await parsePostContext(c)
      const { intents } = await handler(context)
      return c.render(
        <html lang="en">
          <head>
            <meta property="fc:frame" content="vNext" />
            <meta property="fc:frame:image" content={`${c.req.url}_og`} />
            <meta property="og:image" content={`${c.req.url}_og`} />
            <meta property="fc:frame:post_url" content={c.req.url} />
            {parseIntents(intents)}
          </head>
        </html>,
      )
    })
  }
}

////////////////////////////////////////////////////////////////////////
// Components

type FramePreviewProps = {
  baseUrl: string
  frame: Frame
}

function FramePreview({ baseUrl, frame }: FramePreviewProps) {
  return (
    <div style={{ maxWidth: '512px', width: '100%' }}>
      <form
        action="/preview"
        method="post"
        style={{
          borderRadius: '0.5rem',
          display: 'flex-column',
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          style={{
            position: 'relative',
          }}
        >
          <img
            alt={frame.title ?? 'Farcaster frame'}
            src={frame.imageUrl}
            style={{
              aspectRatio: '1.91 / 1',
              borderTopLeftRadius: '.5rem',
              borderTopRightRadius: '0.5rem',
              borderWidth: '1px',
              maxHeight: '526px',
              objectFit: 'cover',
              width: '100%',
            }}
          />
          <div
            style={{
              background: '#00000080',
              borderRadius: '0.25rem',
              bottom: 0,
              color: 'white',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
              marginRight: '1rem',
              paddingBottom: '0.125rem',
              paddingLeft: '0.5rem',
              paddingRight: '0.5rem',
              paddingTop: '0.125rem',
              position: 'absolute',
              right: 0,
            }}
          >
            {new URL(baseUrl).host}
          </div>
          <input name="action" type="hidden" value={frame.postUrl} />
        </div>
        {/* TODO: Text input */}
        {frame.buttons && (
          <div
            style={{
              borderBottomLeftRadius: '0.5rem',
              borderBottomRightRadius: '0.5rem',
              borderTopWidth: '0 !important',
              borderWidth: '1px',
              display: 'grid',
              gap: '10px',
              gridTemplateColumns: `repeat(${frame.buttons.length}, minmax(0,1fr))`,
              paddingBottom: '0.5rem',
              paddingLeft: '1rem',
              paddingRight: '1rem',
              paddingTop: '0.5rem',
            }}
          >
            {frame.buttons.map((button) => (
              <button
                key={button.index}
                name="buttonIndex"
                style={{
                  borderRadius: '0.5rem',
                  borderWidth: '1px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  height: '2.5rem',
                  paddingBottom: '0.5rem',
                  paddingLeft: '1rem',
                  paddingRight: '1rem',
                  paddingTop: '0.5rem',
                }}
                type="submit"
                value={button.index}
              >
                {button.title}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  )
}

export type ButtonProps = {
  children: string
}

export function Button({ children }: ButtonProps) {
  return <meta property="fc:frame:button" content={children} />
}

////////////////////////////////////////////////////////////////////////
// Utilities

type Counter = { button: number }

async function parsePostContext(ctx: Context): Promise<FrameContext> {
  const { trustedData, untrustedData } =
    (await ctx.req.json().catch(() => {})) || {}
  return Object.assign(ctx, { trustedData, untrustedData })
}

function parseIntents(intents_: JSX.Element) {
  const intents = intents_ as unknown as JSXNode
  const counter: Counter = {
    button: 1,
  }

  if (typeof intents.children[0] === 'object')
    return Object.assign(intents, {
      children: intents.children.map((e) => parseIntent(e as JSXNode, counter)),
    })
  return parseIntent(intents, counter)
}

function parseIntent(node: JSXNode, counter: Counter) {
  const intent = (
    typeof node.tag === 'function' ? node.tag({}) : node
  ) as JSXNode

  const props = intent.props || {}

  if (props.property === 'fc:frame:button') {
    props.property = `fc:frame:button:${counter.button++}`
    props.content = node.children
  }

  return Object.assign(intent, { props })
}

function htmlToFrame(html: string) {
  const window = new Window()
  window.document.write(html)
  const document = window.document
  const metaTags = document.querySelectorAll(
    'meta',
  ) as unknown as readonly HTMLMetaElement[]

  const validPropertyNames = new Set<FrameMetaTagPropertyName>([
    'fc:frame',
    'fc:frame:image',
    'fc:frame:input:text',
    'fc:frame:post_url',
    'og:image',
    'og:title',
  ])
  // https://regexr.com/7rlm0
  const buttonRegex = /fc:frame:button:(1|2|3|4)(?::(action|target))?$/

  let currentButtonIndex = 0
  let buttonsAreMissing = false
  let buttonsAreOutOfOrder = false
  const buttonMap = new Map<number, Omit<FrameButton, 'type'>>()
  const buttonActionMap = new Map<number, FrameButton['type']>()
  const invalidButtons: FrameButton['index'][] = []

  const properties: Partial<Record<FrameMetaTagPropertyName, string>> = {}
  for (const metaTag of metaTags) {
    const property = metaTag.getAttribute(
      'property',
    ) as FrameMetaTagPropertyName | null
    if (!property) continue

    const content = metaTag.getAttribute('content') ?? ''
    if (validPropertyNames.has(property)) properties[property] = content
    else if (buttonRegex.test(property)) {
      const matchArray = property.match(buttonRegex) as [
        string,
        string,
        string | undefined,
      ]
      const index = parseInt(matchArray[1], 10) as FrameButton['index']
      const type = matchArray[2] as FrameButton['type'] | undefined

      if (type) buttonActionMap.set(index, content as FrameButton['type'])
      else {
        if (currentButtonIndex >= index) buttonsAreOutOfOrder = true
        if (currentButtonIndex + 1 === index) currentButtonIndex = index
        else buttonsAreMissing = true

        if (buttonsAreOutOfOrder || buttonsAreMissing)
          invalidButtons.push(index)

        const title = content ?? index
        buttonMap.set(index, { index, title })
      }
    }
  }

  const image = properties['og:image'] ?? ''
  const imageUrl = properties['fc:frame:image'] ?? ''
  const postUrl = properties['fc:frame:post_url'] ?? ''
  const title = properties['og:title'] ?? ''
  const version = (properties['fc:frame'] as FrameVersion) ?? 'vNext'

  let buttons = [] as FrameButton[]
  for (const [index, button] of buttonMap) {
    buttons.push({
      ...button,
      type: buttonActionMap.get(index) ?? 'post',
    })
  }
  buttons = buttons.toSorted((a, b) => a.index - b.index)

  const fallbackImageToUrl = !imageUrl
  const postUrlTooLong = postUrl.length > 2_048
  // TODO: Figure out how this is determined
  // https://warpcast.com/~/developers/frames
  const valid = true

  const frame = { buttons, imageUrl, postUrl, version }
  return {
    ...frame,
    debug: {
      ...frame,
      buttonsAreOutOfOrder: buttonsAreMissing || buttonsAreOutOfOrder,
      fallbackImageToUrl,
      htmlTags: metaTags.map((x) => x.outerHTML),
      image,
      invalidButtons,
      postUrlTooLong,
      valid,
    },
    title,
  } satisfies Frame
}

function getGlobalStyles() {
  return `
    :root {
      --bg: #181818;
      --bn: #262626;
      --br: #404040;
      --fg: rgba(255, 255, 255, 0.87);
    }

    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8f8f8;
        --bn: #F5F5F5;
        --br: #A3A3A3;
        --fg: #181818;
      }
    }

    *,
    ::before,
    ::after {
      box-sizing: border-box;
      border-width: 0;
      border-style: solid;
      border-color: var(--br);
    }

    html {
      background-color: var(--bg);
      color-scheme: light dark;
      color: var(--fg);
      font-family: sans-serif;
      font-synthesis: none;
      font-weight: 400;
      line-height: 1.5;
      text-rendering: optimizeLegibility;

      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      -webkit-text-size-adjust: 100%;
    }

    body {
      margin: 0;
      line-height: inherit;
    }
    
    button {
      background: var(--bn);
    }

    button,
    input,
    optgroup,
    select,
    textarea {
      font-family: inherit; 
      font-feature-settings: inherit;
      font-variation-settings: inherit;
      font-size: 100%;
      font-weight: inherit;
      line-height: inherit;
      color: inherit;
      margin: 0;
      padding: 0;
    }

    button,
    input,
    optgroup,
    select,
    textarea {
      font-family: inherit;
      font-feature-settings: inherit;
      font-variation-settings: inherit;
      font-size: 100%;
      font-weight: inherit;
      line-height: inherit;
      color: inherit;
      margin: 0;
      padding: 0;
    }

    button,
    select {
      text-transform: none;
    }

    button,
    [type='button'],
    [type='reset'],
    [type='submit'] {
      -webkit-appearance: button;
      background-color: transparent;
      background-image: none;
    }

    :-moz-focusring {
      outline: auto;
    }

    input::placeholder,
    textarea::placeholder {
      opacity: 1;
      color: #9ca3af;
    }

    button,
    [role="button"] {
      cursor: pointer;
    }

    :disabled {
      cursor: default;
    }

    img,
    svg,
    video,
    canvas,
    audio,
    iframe,
    embed,
    object {
      display: block;
      vertical-align: middle;
    }

    img,
    video {
      max-width: 100%;
      height: auto;
    }

    [hidden] {
      display: none;
    }
  `
}
