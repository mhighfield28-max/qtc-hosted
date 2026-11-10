import { defineAuth } from '@aws-amplify/backend'

// Sign-in with email and password. Cognito sends a code to verify the email before the
// account can be used, so the free-trial credits only go to real addresses.
export const auth = defineAuth({
  loginWith: { email: true },
})
