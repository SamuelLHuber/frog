// TODO: TSDoc

export type TrustedData = {
  messageBytes: string
}

export type UntrustedData = {
  buttonIndex?: FrameButton['index'] | undefined
  castId: { fid: number; hash: string }
  fid: number
  inputText?: string
  messageHash: string
  network: number
  timestamp: number
  url: string
}

export type Frame = {
  buttons?: readonly FrameButton[] | undefined
  debug?: FrameDebug | undefined
  imageUrl: string
  postUrl: string
  title: string
  version: FrameVersion
}

export type FrameDebug = {
  buttons?: readonly FrameButton[] | undefined
  buttonsAreOutOfOrder: boolean
  fallbackImageToUrl: boolean
  htmlTags: readonly string[]
  image: string
  imageUrl: string
  invalidButtons: readonly FrameButton['index'][]
  postUrl: string
  postUrlTooLong: boolean
  valid: boolean
  version: FrameVersion
}

export type FrameButton = {
  index: 1 | 2 | 3 | 4
  title: string
  type: 'post' | 'post_redirect'
}

export type FrameVersion = 'vNext'

export type FrameMetaTagPropertyName =
  | 'fc:frame'
  | 'fc:frame:image'
  | 'fc:frame:input:text'
  | 'fc:frame:post_url'
  | 'og:image'
  | 'og:title'
  | `fc:frame:button:${FrameButton['index']}:action`
  | `fc:frame:button:${FrameButton['index']}:target`
  | `fc:frame:button:${FrameButton['index']}`