# An episode's optional arrival receipt

The deploy takes a public catalog snapshot before uploading. After its
CloudFront checks pass, it compares `/index.json` with the tested catalog.
Only an episode number advancing from a known prior public episode can
report arrival. Unknown baselines, unchanged catalogs, regressions and
failed read-backs announce nothing. Only id, public URL and verification
time reach `another / received`, with `via: site-deploy`.

The transport uses the current authorized AWS identity and verifies each
EventBridge acknowledgement. Failure warns after the healthy deploy;
this is best effort, and polling remains the backstop. The sender neither
reads a secret nor touches an episode, audio or transcript. It does not
turn a manual episode into a WT Builder send. The sync consumer must not
measure an arrival at a system that is the journey's own origin.

Merged 2026-10-27; inert until the sync stack lists this repository's
deploy role (`another-delivery-DeploymentRole-MqFYwR1djEVW`) in
`ReceiverRoles` and the repository Actions variable
`SYNC_RECEIVED_BUS=thingelstad-publishing` is set; empty is off.
Permission rehearsal and the first natural episode remain acceptance work.
No test `published` or `received` is put on the bus. Hop 21 stays unverified
as a WT Builder send until a real one announces itself.
