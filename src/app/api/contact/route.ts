import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  try {
    const { subject, body, userInfo } = await req.json()
    const userEmail = userInfo.email !== 'N/A' ? userInfo.email : null

    // 1. Forward the enquiry to unbornbuddhamind@gmail.com
    // Sets 'replyTo' to the user's email so clicking "Reply" in Gmail replies directly to the user
    await resend.emails.send({
      from: 'Omenland <hello@omen.land>',
      to: ['unbornbuddhamind@gmail.com'],
      replyTo: userEmail || undefined,
      subject: `[Website Enquiry] ${subject}`,
      html: `
        <h2>New Message Received</h2>
        <p><strong>Message:</strong></p>
        <blockquote style="background: #f4f4f4; padding: 12px; border-left: 4px solid #333;">
          ${body.replace(/\n/g, '<br>')}
        </blockquote>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <h3>User Details</h3>
        <ul>
          <li><strong>Email:</strong> ${userInfo.email}</li>
          <li><strong>Username:</strong> ${userInfo.username}</li>
          <li><strong>Tier:</strong> ${userInfo.tier}</li>
          <li><strong>Workspace:</strong> ${userInfo.workspaceName} (${userInfo.workspaceId})</li>
        </ul>
      `,
    })

    // 2. Simple confirmation email sent back to the user from hello@omen.land
    if (userEmail) {
      await resend.emails.send({
        from: 'Omenland <hello@omen.land>',
        to: [userEmail],
        subject: `We've received your message`,
        html: `
          <p>Hi ${userInfo.username},</p>
          <p>Thanks for getting in touch! We've received your message and will read through it shortly.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p><strong>Your Message:</strong></p>
          <p style="color: #555;"><em>${body.replace(/\n/g, '<br>')}</em></p>
        `,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to process email request' },
      { status: 500 }
    )
  }
}