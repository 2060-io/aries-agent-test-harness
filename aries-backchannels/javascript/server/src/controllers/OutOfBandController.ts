import { Controller, Post, BodyParams } from '@tsed/common'
import {
  ConnectionRecord,
  JsonTransformer,
  ConnectionEventTypes,
  ConnectionStateChangedEvent,
  DidExchangeState,
  OutOfBandInvitation,
  Attachment,
  HandshakeProtocol,
  AgentConfig,
  AriesFrameworkError,
  AgentMessage,
} from '@aries-framework/core'

import { filter, firstValueFrom, ReplaySubject, timeout } from 'rxjs'
import { BaseController } from '../BaseController'
import { TestHarnessConfig } from '../TestHarnessConfig'

@Controller('/agent/command/out-of-band')
export class DidExchangeController extends BaseController {
  private subject = new ReplaySubject<ConnectionStateChangedEvent>()

  public constructor(testHarnessConfig: TestHarnessConfig) {
    super(testHarnessConfig)
  }

  onStartup = () => {
    this.subject = new ReplaySubject<ConnectionStateChangedEvent>()
    // Catch all events in replay subject for later use
    this.agent.events
      .observable<ConnectionStateChangedEvent>(ConnectionEventTypes.ConnectionStateChanged)
      .subscribe(this.subject)
  }

  @Post('/send-invitation-message')
  async sendInvitation(@BodyParams('data') data?: { mediator_connection_id?: string, use_public_did?: string, attachments?: AgentMessage[], handshake_protocols: HandshakeProtocol[] }) {

    const mediatorId = await this.mediatorIdFromMediatorConnectionId(data?.mediator_connection_id)

    const routing = await this.agent.mediationRecipient.getRouting({
      mediatorId,
    })

    const outOfBandRecord = await this.agent.oob.createInvitation({
      routing,
      messages: data?.attachments?.map(item => JsonTransformer.fromJSON(item, AgentMessage)),
      handshakeProtocols: data?.handshake_protocols ?? [HandshakeProtocol.DidExchange],
      // Needed to complete connection: https://github.com/hyperledger/aries-framework-javascript/issues/668
      autoAcceptConnection: true,
    })

    const config = this.agent.injectionContainer.resolve(AgentConfig)
    const invitationJson = outOfBandRecord.outOfBandInvitation.toJSON({ useLegacyDidSovPrefix: config.useLegacyDidSovPrefix })

    return {
      state: DidExchangeState.InvitationSent,
      // This should be the connection id. However, the connection id is not available until a request is received.
      // We can just use the oob invitation I guess.
      connection_id: outOfBandRecord.id,
      invitation: invitationJson,
    }

  }

  @Post('/receive-invitation')
  async receiveInvitation(@BodyParams('data') data: Record<string, unknown> & { mediator_connection_id?: string }) {
    const { mediator_connection_id, ...invitationJson } = data

    const mediatorId = await this.mediatorIdFromMediatorConnectionId(mediator_connection_id)

    const routing = await this.agent.mediationRecipient.getRouting({
      mediatorId,
    })

    const oobInvitation = JsonTransformer.fromJSON(invitationJson, OutOfBandInvitation)
    const { outOfBandRecord } = await this.agent.oob.receiveInvitation(oobInvitation, {
      routing,
      // Needed to complete connection: https://github.com/hyperledger/aries-framework-javascript/issues/668
      autoAcceptConnection: true,
      autoAcceptInvitation: true,
    })

    //this.agent.config.logger.debug('ConnectionController.receiveInvitation: connectionRecord.id: ', connectionRecord)
    return {
      state: DidExchangeState.InvitationReceived,
      // This should be the connection id. However, the connection id is not available until a request is received.
      // We can just use the oob invitation I guess.
      connection_id: outOfBandRecord.id,
    }
  }

  private async mediatorIdFromMediatorConnectionId(mediatorConnectionId?: string): Promise<string | undefined> {
    if (!mediatorConnectionId) return undefined

    // Find mediator id if mediator connection id is provided
    const mediator = await this.agent.mediationRecipient.findByConnectionId(mediatorConnectionId)

    return mediator?.id
  }

  private async waitForState(id: string, state: DidExchangeState) {
    return await firstValueFrom(
      this.subject.pipe(
        filter((c) => c.payload.connectionRecord.id === id || c.payload.connectionRecord.outOfBandId === id),
        filter((c) => c.payload.connectionRecord.state === state),
        timeout(20000)
      )
    )
  }

  private mapConnection(connection: ConnectionRecord) {
    return {
      // If we use auto accept, we can't include the state as we will move quicker than the calls in the test harness. This will
      // make verification fail. The test harness recognizes the 'N/A' state.
      state: connection.state === DidExchangeState.Completed ? connection.rfc0160State : 'N/A',
      connection_id: connection.id,
      connection,
    }
  }
}
