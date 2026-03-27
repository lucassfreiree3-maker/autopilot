import { BBError } from "dev-javascript-erro";
import { Get, Route, SuccessResponse, Tags } from "tsoa";

@Tags("General")
@Route("/create-cronjob")
export class CreateCronjobController {
  /**
   * Endpoint para exemplo de requisições GET
   *
   * @summary Endpoint para exemplo de requisições GET
   *
   */
  @SuccessResponse("200", "Cronjob criado com sucesso")
  @Get("/")
  public static async getMessage(): Promise<string | null> {
    try {
      return "Cronjob criado com sucesso";
    } catch (error) {
      throw BBError.fromErroClienteMessage(error.message);
    }
  }
}

export default CreateCronjobController;
