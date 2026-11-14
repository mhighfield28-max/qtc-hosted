import { defineAuth } from '@aws-amplify/backend'
import hosted from '../../config/hosted.json'

// Sign-in with email and password. Cognito sends a code to verify the email before the
// account can be used, so free questions only go to real addresses.
//
// The codes are sent through Amazon SES from the address in config/hosted.json (emailFrom),
// so they arrive from your own domain and aren't limited to Cognito's ~50 a day.
// That domain must be verified in SES in the same region, with production access.
// Leave emailFrom empty and Cognito's built-in sender is used instead.

const sender = hosted.emailFrom
  ? {
      email: {
        fromEmail: hosted.emailFrom,
        fromName: hosted.emailFromName || undefined,
        replyTo: hosted.emailReplyTo || undefined,
      },
    }
  : undefined

export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: 'Your Questions That Count code',
      verificationEmailBody: (createCode) =>
        `Your Questions That Count code is ${createCode()}\n\n` +
        "Type it into the page where you asked for it. If you didn't ask for a code, you can ignore this email.",
    },
  },
  senders: sender,
})
