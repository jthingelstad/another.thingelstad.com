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

This is a prepared PR only: no merge or deployment during the night.
First apply the reviewed sync-stack grant for the existing
`another-delivery-DeploymentRole-MqFYwR1djEVW`, scoped to this bus, source
`another`, types `received` and `ping`. Then set the repository Actions
variable `SYNC_RECEIVED_BUS=thingelstad-publishing`; empty is off.
Permission rehearsal and the first natural episode remain acceptance work.
No test `published` or `received` is put on the bus. Hop 21 stays unverified
as a WT Builder send until a real one announces itself.
