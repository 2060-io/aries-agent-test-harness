import { Controller, Get, PathParams, Post, BodyParams } from '@tsed/common'
import { NotFound } from '@tsed/exceptions'
import {
  ConnectionRecord,
  JsonTransformer,
  ConnectionEventTypes,
  ConnectionStateChangedEvent,
  DidExchangeState,
  OutOfBandInvitation,
  DidDocument,
} from '@aries-framework/core'

import { filter, firstValueFrom, ReplaySubject, timeout } from 'rxjs'
import { BaseController } from '../BaseController'
import { TestHarnessConfig } from '../TestHarnessConfig'
import { ConnectionUtils } from '../utils/ConnectionUtils'

@Controller('/agent/command/did-exchange')
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

  @Get('/:id')
  async getConnectionById(@PathParams('id') id: string) {
    const connection = await ConnectionUtils.getConnectionByConnectionIdOrOutOfBandId(this.agent, id)

    if (!connection) throw new NotFound(`Connection with id ${id} not found`)

    return this.mapConnection(connection)
  }

  @Post('/create-request-resolvable-did')
  async createRequestResolvableDid(@BodyParams('data') data?: { their_public_did?: string, their_did?: string }) {

    const theirDid = data?.their_did || data?.their_public_did

    if (!theirDid) {
      throw new Error('Their DID is not specified')
    }

    const oob = new OutOfBandInvitation({
      label: 'Resolvable DID',
      services: [
        theirDid,
      ]
    })

    const { connectionRecord } = await this.agent.oob.receiveInvitation(oob, { autoAcceptInvitation: true })

    return {
      connection_id: connectionRecord?.id,
    }
  }

  @Post('/receive-request-resolvable-did')
  async receiveRequestResolvableDid(@BodyParams('data') data: Record<string, unknown>) {
    const didDocument = JsonTransformer.fromJSON(data, DidDocument)

    const oob = new OutOfBandInvitation({
      label: 'Resolvable DID',
      services: didDocument.didCommServices
    })
    const { outOfBandRecord } = await this.agent.oob.receiveInvitation(oob, { autoAcceptInvitation: false })

    return {
      // There is no actual ConnectionRecord done at this point. But send-request can be called with this id
      connection_id: outOfBandRecord.id,
    }
  }

  @Post('/send-request')
  async sendRequest(@BodyParams('id') id: string) {
    const { outOfBandRecord } = await this.agent.oob.acceptInvitation(id, {})
  }

  @Post('/send-response')
  async sendResponse(@BodyParams('id') id: string) {
    // possible here that the request hasn't finished processing yet
    //await this.waitForState(id, DidExchangeState.RequestReceived)

    const connection = await ConnectionUtils.getConnectionByConnectionIdOrOutOfBandId(this.agent, id)

    await this.agent.connections.acceptRequest(connection.id)

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

@Controller('/agent/response/did-exchange')
export class DidExchangeResponseController extends BaseController {
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

  @Get('/:id')
  async getConnectionById(@PathParams('id') id: string) {
    
    try {
      const connection = await ConnectionUtils.getConnectionByConnectionIdOrOutOfBandId(this.agent, id)
      return this.mapConnection(connection)
    } catch (error) {
      let oobRecord = await this.agent.oob.findById(id)
      if (!oobRecord) oobRecord = await this.agent.oob.findByInvitationId(id)
    
      if (!oobRecord) throw new NotFound(`OOB with id ${id} not found`)

      return {
        state: DidExchangeState.InvitationSent,
        connection_id: id,
      }
    }    
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
